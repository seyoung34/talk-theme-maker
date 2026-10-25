// Local-only profiling harness. Replaces every outbound fetch; no real backend.
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import { maxHeaderSize } from 'node:http';
import { Miniflare, Response as MFResponse, convertV4MiniflareOptions } from 'miniflare';

const root = process.cwd();
if(!['prepare','bundle','measure','startup','os-cpu','summarize','report','verify','privacy-contract'].includes(process.argv[2])) {
  console.error('Usage: node --max-http-header-size=131072 scripts/profile-worker-cpu.mjs prepare|bundle|startup|measure|os-cpu|report|verify|privacy-contract|summarize [profiles...]');
  process.exit(1);
}
if(['measure','os-cpu','verify','privacy-contract'].includes(process.argv[2]) && maxHeaderSize < 131072) {
  throw new Error('Run Node with --max-http-header-size=131072; otherwise the local bridge can silently break registry requests.');
}
const output = path.resolve(process.env.CPU_OUTPUT ?? 'docs/report/cpu-baseline-2026-10-25');
await mkdir(output, { recursive: true });
const fixtureBindings = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://cpu-fixture.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-anon-key',
  SUPABASE_SECRET_KEY: 'fixture-service-key',
  NEXT_PUBLIC_SITE_URL: 'https://cpu-local.invalid',
  MONITOR_READINESS_TOKEN: 'cpu_fixture_readiness_token_1234567890',
  TELEGRAM_NOTIFICATIONS_ENABLED: '0',
  GROBLE_CHECKOUT_ENABLED: '0',
  ASSET_CATALOG_EXPORT_ENABLED_ANDROID: '1',
  ASSET_CATALOG_EXPORT_ENABLED_IOS: '1',
  NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_ANDROID: '1',
  NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_IOS: '1',
};
const configPath = path.join(output, 'wrangler.local.json');
const fixtureEnvModule = `export const production = ${JSON.stringify(fixtureBindings)};\nexport const development = production;\nexport const test = production;\n`;
if (process.argv[2] === 'prepare') {
  // OpenNext copies server .env values to this GENERATED file. Replace all of them
  // before bundling; never retain real credentials in profiling artifacts.
  await writeFile('.open-next/cloudflare/next-env.mjs', fixtureEnvModule);
  // The independent fast path consumes the same sanitized public build values.
  execFileSync(process.execPath, ['scripts/prepare-worker-public-config.mjs']);
  await writeFile(configPath, JSON.stringify({
    name: 'cpu-local', main: path.resolve(process.env.CPU_ENTRY ?? path.join(root, 'worker.ts')),
    compatibility_date: '2026-07-07',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    vars: fixtureBindings,
  }, null, 2));
  console.log(configPath);
  process.exit(0);
}

if (process.argv[2] === 'bundle') {
  if(await readFile('.open-next/cloudflare/next-env.mjs','utf8') !== fixtureEnvModule) {
    throw new Error('Run prepare after each OpenNext build to strip real server environment values before bundling.');
  }
  const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js',
    'check','startup','-c',configPath,'--outfile',path.join(output,'startup-0.cpuprofile'),
    `--args=--config=${path.relative(root,configPath).replaceAll('\\','/')} --metafile=${path.relative(root,path.join(output,'bundle-meta.json')).replaceAll('\\','/')}`,
  ], {stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  // Wrangler check startup removes its temporary multipart bundle on exit.
  // Preserve that exact local-only bundle while analysis is running.
  let copied = false;
  async function preserve() {
    for (const base of [root,output]) {
      const tmp = path.join(base,'.wrangler/tmp');
      for (const name of await readdir(tmp).catch(()=>[])) {
        if(!name.startsWith('startup-profile-')) continue;
        const src = path.join(tmp,name,'worker.bundle');
        try { await copyFile(src,path.join(output,'worker.bundle')); copied = true; } catch { /* not yet written */ }
      }
    }
  }
  const timer = setInterval(()=>void preserve(),100);
  const code = await new Promise(resolve=>child.on('exit',resolve));
  clearInterval(timer);
  if(code || !copied) throw new Error(`Startup check ${code}; bundle preserved: ${copied}`);
  process.exit(0);
}

function summarize(profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n]));
  const totals = new Map();
  let idleUs = 0, activeUs = 0;
  for (let i = 0; i < (profile.samples ?? []).length; i++) {
    const frame = nodes.get(profile.samples[i])?.callFrame;
    const us = profile.timeDeltas[i] ?? 0;
    if (frame?.functionName === '(idle)') { idleUs += us; continue; }
    activeUs += us;
    const key = `${frame?.functionName || '(anonymous)'} @ ${frame?.url || '(native)'}:${(frame?.lineNumber ?? -1) + 1}`;
    totals.set(key, (totals.get(key) ?? 0) + us);
  }
  return {
    activeMs: activeUs / 1000, idleMs: idleUs / 1000,
    windowMs: (profile.endTime - profile.startTime) / 1000,
    samples: profile.samples?.length ?? 0,
    topSelf: [...totals].sort((a,b) => b[1]-a[1]).slice(0,20).map(([frame,us]) => ({frame,ms:us/1000})),
  };
}

if (process.argv[2] === 'summarize') {
  const files = process.argv.slice(3);
  for (const file of files) console.log(JSON.stringify({file,...summarize(JSON.parse(await readFile(file,'utf8')))}));
  process.exit(0);
}

if(process.argv[2] === 'report') {
  const requestData = JSON.parse(await readFile(path.join(output,'requests.json'),'utf8'));
  const processData = JSON.parse(await readFile(path.join(output,'process-cpu.json'),'utf8'));
  const quantile = (array,p) => array.toSorted((a,b)=>a-b)[Math.ceil(array.length*p)-1];
  const rows = [];
  for(const route of new Set(requestData.results.map(r=>r.route))) {
    const all = requestData.results.filter(r=>r.route===route);
    const cold=all.filter(r=>r.index===0), warm=all.filter(r=>r.index>0);
    const proc=processData.results.filter(r=>r.route===route);
    rows.push({route,coldN:cold.length,warmN:warm.length,
      coldMedianMs:quantile(cold.map(r=>r.activeMs),.5),coldMinMs:Math.min(...cold.map(r=>r.activeMs)),coldMaxMs:Math.max(...cold.map(r=>r.activeMs)),
      warmMedianMs:quantile(warm.map(r=>r.activeMs),.5),warmP95Ms:quantile(warm.map(r=>r.activeMs),.95),
      processColdMs:proc.map(r=>r.coldCpuMs),processWarmMeanMs:proc.map(r=>r.warmMeanCpuMs),
      coldCalls:cold[0].calls,warmCalls:warm[0].calls,bytes:cold[0].bytes,status:cold[0].status,
    });
  }
  const startup=[];
  for(let i=0;i<5;i++) startup.push(summarize(JSON.parse(await readFile(path.join(output,`module-startup-${i}.cpuprofile`),'utf8'))));
  const raw=await readFile(path.join(output,'worker.bundle'));
  const boundary=raw.subarray(2,raw.indexOf(10)).toString().trim();
  const form=await new Response(raw,{headers:{'content-type':`multipart/form-data; boundary=${boundary}`}}).formData();
  const metadata=JSON.parse(form.get('metadata'));
  const text=await form.get(metadata.main_module).text();
  await writeFile(path.join(output,'worker.js'),text);
  const bytes=Buffer.byteLength(text),gzipBytes=gzipSync(text).length;
  const summary={environment:requestData.environment,rows,startup,bundle:{bytes,gzipBytes}};
  await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
  console.table(rows.map(({route,coldMedianMs,warmMedianMs,warmP95Ms})=>({route,coldMedianMs,warmMedianMs,warmP95Ms})));
  console.log(path.join(output,'summary.json'));
  process.exit(0);
}

const userId = '11111111-2222-4333-8444-555555555555';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid',
  app_metadata: {provider:'email'}, user_metadata: {name:'CPU Fixture'}, created_at:'2026-01-01T00:00:00Z' };
const token = `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:userId,exp:4102444800,aud:'authenticated',role:'authenticated'})).toString('base64url')}.fixture`;
const session = { access_token:token, refresh_token:'fixture', token_type:'bearer', expires_at:4102444800, expires_in:31536000, user };
const cookie = `sb-cpu-fixture-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
function sourceRows(count) {
  return Array.from({length:count}, (_,i) => {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
    return {id,slot_role:'main_background',platform:'android',asset_kind:'background',
      analysis:{width:720,height:1280},bubble_adjustment:null,title:`Fixture ${i}`,note:null,tags:[],
      file_name:`${i}.png`,mime_type:'image/png',storage_path:`fixture/${i}.png`,asset_object_id:null,enabled:true,
      created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',
      admin_asset_targets:[{asset_id:id,platform:'all',slot_role:null,target_kind:'asset_kind',priority:i%10,enabled:true}],
      admin_asset_bubble_specs:[],admin_asset_variants:[]};
  });
}

async function connect(mf) {
  const base = await mf.getInspectorURL();
  let ws;
  for(let attempt=0;attempt<5;attempt++) {
    ws = new WebSocket(new URL('/core:user:cpu-local',base));
    try {
      await new Promise((resolve,reject) => {ws.onopen=resolve;ws.onerror=reject;});
      break;
    } catch(error) {
      ws.close();
      if(attempt===4) throw error;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }
  let id = 0;
  const pending = new Map();
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (!msg.id) return;
    const p = pending.get(msg.id); pending.delete(msg.id);
    if (msg.error) p?.reject(new Error(JSON.stringify(msg.error))); else p?.resolve(msg.result);
  };
  const send = (method,params={}) => new Promise((resolve,reject) => {
    const requestId = ++id; pending.set(requestId,{resolve,reject});
    ws.send(JSON.stringify({id:requestId,method,params}));
  });
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval',{interval:100});
  return {send, close:()=>ws.close()};
}

async function runtime(count, startup = false, assetsEnabled = process.env.CPU_ASSETS === '1') {
  const rows = sourceRows(count);
  const calls = [];
  const assetCalls = [];
  const unexpected = [];
  const outboundService = async request => {
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}`);
    if (url.hostname !== 'cpu-fixture.invalid') {unexpected.push(request.url); return new MFResponse('blocked',{status:502});}
    let data;
    if (url.pathname === '/auth/v1/user') data = user;
    else if (url.pathname === '/rest/v1/admin_assets') {
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 200);
      data = rows.slice(offset,offset+limit);
    } else if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      const body = await request.json();
      data = body.paths.map(p=>({path:p,signedURL:`/object/sign/theme-assets/${p}?token=fixture`,error:null}));
    } else if (url.pathname === '/rest/v1/rpc/claim_signup_bonus') {
      data = [{campaign_key:'signup_bonus_v1',credits_granted:3,balance:3,already_claimed:false}];
    } else if (['/rest/v1/profiles','/rest/v1/credit_balances'].includes(url.pathname)) {
      data = request.method === 'POST' ? null : url.pathname.endsWith('profiles') ? {user_id:userId,email:user.email,display_name:'CPU Fixture'} : {balance:3,billing_hold:false};
    } else if (['/rest/v1/export_jobs','/rest/v1/admin_profiles','/rest/v1/credit_promotion_claims','/rest/v1/credit_ledger','/rest/v1/theme_asset_objects'].includes(url.pathname)) {
      data = [];
    } else {unexpected.push(`${request.method} ${url.pathname}`);return new MFResponse('blocked',{status:502});}
    if (request.method === 'HEAD') return new MFResponse(null,{status:200});
    return new MFResponse(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  };
  // The exact Wrangler-produced modules are used, with all network traffic replaced.
  const raw = await readFile(path.join(output,'worker.bundle'));
  const boundary = raw.subarray(2,raw.indexOf(10)).toString().trim();
  const form = await new Response(raw,{headers:{'content-type':`multipart/form-data; boundary=${boundary}`}}).formData();
  const metadata = JSON.parse(form.get('metadata'));
  const modules = [];
  for (const [name,value] of form) {
    if (typeof value === 'string' || value.type === 'application/source-map') continue;
    const type = value.type === 'application/wasm' ? 'CompiledWasm' : value.type === 'application/octet-stream' ? 'Data' : 'ESModule';
    modules.push({type,path:`/${name}`,contents:new Uint8Array(await value.arrayBuffer())});
  }
  modules.sort((a,b)=>Number(b.path===`/${metadata.main_module}`)-Number(a.path===`/${metadata.main_module}`));
  if(startup) modules.unshift({type:'ESModule',path:'/cpu-startup-loader.js',contents:
    `export default { async fetch() { await import('./${metadata.main_module}'); return new Response('ok'); } };`});
  const mf = new Miniflare(convertV4MiniflareOptions({name:'cpu-local',modules,modulesRoot:'/',
    compatibilityDate:'2026-07-07',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],
    bindings:fixtureBindings,outboundService,inspectorPort:0,port:0,
    serviceBindings:{ASSETS:async request=>{
      const pathname = new URL(request.url).pathname;
      assetCalls.push(pathname);
      if(!assetsEnabled) return new MFResponse('missing',{status:404});
      const assetsRoot = path.resolve('.open-next/assets');
      const assetPath = path.resolve(assetsRoot, `.${pathname}`);
      if(!assetPath.startsWith(`${assetsRoot}${path.sep}`)) throw new Error('Invalid asset path');
      try {return new MFResponse(await readFile(assetPath),{headers:{'content-type':'application/json'}});}
      catch(error) {if(error.code === 'ENOENT') return new MFResponse('missing',{status:404});throw error;}
    }},
  }));
  await mf.ready;
  return {mf,calls,unexpected,assetCalls};
}

if(process.argv[2] === 'startup') {
  for(let i=0;i<5;i++) {
    const {mf} = await runtime(0,true);
    const cdp = await connect(mf);
    try {
      await cdp.send('Profiler.start');
      await (await mf.dispatchFetch('https://cpu-local.invalid')).text();
      const {profile} = await cdp.send('Profiler.stop');
      await writeFile(path.join(output,`module-startup-${i}.cpuprofile`),JSON.stringify(profile));
      console.log(JSON.stringify({repeat:i,...summarize(profile)}));
    } finally {cdp.close();await mf.dispose();}
  }
  process.exit(0);
}

const routes = [
  {name:'home',path:'/'},
  {name:'session-anon',path:'/api/session'},
  {name:'session-auth',path:'/api/session',auth:true},
  {name:'me-anon',path:'/api/me'},
  {name:'next-after-session',path:'/api/me',preheat:true},
  {name:'me-auth',path:'/api/me',auth:true},
  {name:'bonus-anon',path:'/api/credits/signup-bonus',method:'POST',status:401},
  {name:'bonus-auth',path:'/api/credits/signup-bonus',method:'POST',auth:true},
  {name:'privacy-rsc',path:'/privacy?_rsc=cpu',headers:{RSC:'1'}},
  {name:'privacy-html',path:'/privacy'},
  ...['terms','refund','support','copyright'].flatMap(name=>[
    {name:`${name}-html`,path:`/${name}`},
    {name:`${name}-rsc`,path:`/${name}?_rsc=cpu`,headers:{RSC:'1'}},
  ]),
  {name:'login',path:'/login'},
  {name:'readiness',path:'/api/internal/ops/readiness',headers:{authorization:`Bearer ${fixtureBindings.MONITOR_READINESS_TOKEN}`}},
  {name:'recommended-24',path:'/api/theme-assets/recommended?platform=android&assetKind=background&limit=24',count:24},
  {name:'recommended-200',path:'/api/theme-assets/recommended?platform=android&assetKind=background&limit=24',count:200},
  {name:'recommended-1000',path:'/api/theme-assets/recommended?platform=android&assetKind=background&limit=24',count:1000},
  ...[24,200,1000,5000].map(count=>({name:`recommended-${count}-loaded`,
    path:'/api/theme-assets/recommended?platform=android&assetKind=background&limit=24',count,preheat:true})),
];
const filter = process.env.CPU_ROUTES?.split(',');
const repeats = Number(process.env.CPU_COLD_REPEATS || 3);
const warm = Number(process.env.CPU_WARM_REPEATS || 20);
if(process.argv[2] === 'privacy-contract') {
  const policyPath = process.env.CPU_POLICY_PATH ?? '/privacy';
  const policyName = policyPath.slice(1);
  const results = [];
  const tree = encodeURIComponent(JSON.stringify(['', {children:['terms', {children:['__PAGE__', {}]}]}, null, null, true]));
  const cases = [
    {name:'html',headers:{}},
    {name:'rsc',headers:{RSC:'1'}},
    {name:'navigation',headers:{RSC:'1','Next-Router-State-Tree':tree,'Next-Url':'/terms'}},
    {name:'prefetch',headers:{RSC:'1','Next-Router-Prefetch':'1','Next-Router-State-Tree':tree}},
    {name:'segment-prefetch',headers:{RSC:'1','Next-Router-Segment-Prefetch':'/_tree'}},
    {name:'auth-html',headers:{cookie}},
    {name:'auth-rsc',headers:{RSC:'1',cookie}},
    {name:'draft',headers:{cookie:'__prerender_bypass=invalid'}},
    {name:'head',method:'HEAD',headers:{}},
    {name:'post',method:'POST',headers:{}},
    {name:'next-action',method:'POST',headers:{'Next-Action':'invalid'}},
  ];
  for(const enabled of [false,true]) {
    const {mf,calls,unexpected,assetCalls} = await runtime(0,false,enabled);
    try {
      for(const test of cases) {
        const response = await mf.dispatchFetch(`https://cpu-local.invalid${policyPath}?contract=1${test.headers.RSC?'&_rsc=contract':''}`,{method:test.method ?? 'GET',headers:test.headers});
        const body = await response.text();
        if((!test.method && response.status!==200) || unexpected.length || calls.length) throw new Error(`Privacy contract failed: ${test.name}`);
        // Invalid draft cookies are cleared by Next on the fallback path.
        if(response.headers.has('set-cookie') && test.name !== 'draft') throw new Error('Personalized policy response');
        const headers=Object.fromEntries(response.headers);
        await writeFile(path.join(output,`${policyName}-contract-${enabled?'hit':'miss'}-${test.name}.body`),body);
        results.push({enabled,name:test.name,status:response.status,headers,bytes:Buffer.byteLength(body),assetCalls:[...assetCalls]});
      }
    } finally {await mf.dispose();}
  }
  await writeFile(path.join(output,`${policyName}-contract.json`),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  process.exit(0);
}
if(process.argv[2] === 'verify') {
  const verified=[];
  for(const route of routes.filter(r=>!filter || filter.includes(r.name))) {
    const {mf,calls,unexpected,assetCalls}=await runtime(route.count ?? 0);
    try {
      const response=await mf.dispatchFetch(`https://cpu-local.invalid${route.path}`,{method:route.method ?? 'GET',headers:{...route.headers,...(route.auth?{cookie}:{})}});
      const body=await response.text();
      const contentType=response.headers.get('content-type');
      if(response.status !== (route.status ?? 200) || unexpected.length) throw new Error(`Unexpected result: ${route.name}`);
      if(route.count !== undefined) {
        const data=JSON.parse(body);
        if(data.items?.length !== Math.min(24,route.count) || Boolean(data.nextCursor) !== (route.count>24)) throw new Error('Invalid recommendation fixture');
      }
      if(route.name==='me-auth' && JSON.parse(body).user?.id!==userId) throw new Error('Authentication fixture did not reach account reads');
      if(route.name==='bonus-auth' && JSON.parse(body).creditsGranted!==3) throw new Error('Bonus fixture did not reach RPC');
      const result={route:route.name,status:response.status,contentType,bytes:Buffer.byteLength(body),prefix:body.slice(0,35),calls,assetCalls,headers:Object.fromEntries(response.headers)};
      if(route.name.startsWith('privacy-')) await writeFile(path.join(output,`${route.name}.body`),body);
      verified.push(result);console.log(JSON.stringify(result));
    } finally {await mf.dispose();}
  }
  await writeFile(path.join(output,'verified-responses.json'),JSON.stringify(verified,null,2));
  process.exit(0);
}
if(process.argv[2] === 'os-cpu') {
  if(process.platform !== 'win32') throw new Error('os-cpu mode uses Windows process CPU accounting');
  const powershell = command => execFileSync('pwsh',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8'}).trim();
  const data = [];
  for(const route of routes.filter(r=>!filter || filter.includes(r.name))) {
    for(let repeat=0;repeat<repeats;repeat++) {
      const {mf,calls,unexpected} = await runtime(route.count ?? 0);
      try {
        const pid = Number(powershell(`Get-CimInstance Win32_Process -Filter "Name='workerd.exe' AND ParentProcessId=${process.pid}" | Select-Object -ExpandProperty ProcessId`));
        if(!Number.isInteger(pid) || pid <= 0) throw new Error('Cannot identify owned workerd process');
        const cpu = () => Number(powershell(`(Get-Process -Id ${pid}).TotalProcessorTime.TotalMilliseconds`));
        async function request() {
          const response = await mf.dispatchFetch(`https://cpu-local.invalid${route.path}`,{method:route.method ?? 'GET',headers:{...route.headers,...(route.auth?{cookie}:{})}});
          await response.text();
          if(response.status !== (route.status ?? 200) || unexpected.length) throw new Error(`Unexpected status or outbound call: ${route.name}`);
        }
        if(route.preheat) await (await mf.dispatchFetch('https://cpu-local.invalid/api/session')).text();
        const c0=cpu(); await request(); const c1=cpu();
        // Let the same route settle before the unprofiled warm batch.
        for(let i=0;i<10;i++) await request();
        const beforeCalls=calls.length;
        const c2=cpu(), start=performance.now();
        for(let i=0;i<100;i++) await request();
        const wallMs=performance.now()-start, c3=cpu();
        const result={route:route.name,repeat,sourceRows:route.count ?? null,coldCpuMs:c1-c0,warmBatchCpuMs:c3-c2,warmRequests:100,warmMeanCpuMs:(c3-c2)/100,warmBatchWallMs:wallMs,warmCalls:calls.length-beforeCalls,pid};
        data.push(result);console.log(JSON.stringify(result));
        await writeFile(path.join(output,'process-cpu.json'),JSON.stringify({environment:{node:process.version,cpu:os.cpus()[0].model,metric:'owned workerd process user+kernel CPU; includes all runtime threads; 100-request warm batch; no profiler'},results:data},null,2));
      } finally {await mf.dispose();}
    }
  }
  process.exit(0);
}
const results = [];
const envInfo = {timestamp:new Date().toISOString(),node:process.version,platform:process.platform,
  cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  repeats,warm,samplingIntervalUs:100,metric:'V8 sampled non-idle time; not production cpuTimeMs'};
for (const route of routes.filter(r=>!filter || filter.includes(r.name))) {
  for (let repeat=0; repeat<repeats; repeat++) {
    const {mf,calls,unexpected} = await runtime(route.count ?? 0);
    const cdp = await connect(mf);
    try {
      if(route.preheat) await (await mf.dispatchFetch(`https://cpu-local.invalid${process.env.CPU_PREHEAT_PATH ?? '/api/session'}`)).text();
      for (let i=0; i<=warm; i++) {
        const before = calls.length;
        await cdp.send('Profiler.start');
        const start = performance.now();
        const response = await mf.dispatchFetch(`https://cpu-local.invalid${route.path}`,{
          method:route.method ?? 'GET',headers:{...route.headers,...(route.auth?{cookie}:{})},
        });
        const body = await response.text();
        const wallMs = performance.now()-start;
        const {profile} = await cdp.send('Profiler.stop');
        const filename = `${route.name}-${repeat}-${i===0?'cold':`warm-${i}`}.cpuprofile`;
        await writeFile(path.join(output,filename),JSON.stringify(profile));
        const result = {route:route.name,path:route.path,repeat,index:i,phase:i===0?(route.preheat?'route-cold-cache-miss':'first-request'):'warm',
          sourceRows:route.count ?? null,status:response.status,bytes:Buffer.byteLength(body),wallMs,
          calls:calls.slice(before),...summarize(profile)};
        results.push(result);
        if(response.status !== (route.status ?? 200)) throw new Error(`${route.name} status ${response.status}: ${body.slice(0,500)}`);
        if(unexpected.length) throw new Error(`Blocked outbound: ${unexpected.join(',')}`);
      }
      console.log(JSON.stringify({route:route.name,repeat,cold:results.at(-(warm+1)).activeMs,warm:results.slice(-warm).map(r=>r.activeMs)}));
    } finally {cdp.close();await mf.dispose();await writeFile(path.join(output,'requests.json'),JSON.stringify({environment:envInfo,results},null,2));}
  }
}
const meta = JSON.parse(await readFile(path.join(output,'bundle-meta.json'),'utf8'));
const contributions = Object.entries(meta.outputs).flatMap(([outputName,v])=>Object.entries(v.inputs ?? {}).map(([input,entry])=>({output:outputName,input,bytes:entry.bytesInOutput}))).sort((a,b)=>b.bytes-a.bytes);
const handlerMeta = JSON.parse(await readFile('.open-next/server-functions/default/handler.mjs.meta.json','utf8'));
const handlerContributions = Object.entries(handlerMeta.outputs).flatMap(([outputName,v])=>Object.entries(v.inputs ?? {}).map(([input,entry])=>({output:outputName,input,bytes:entry.bytesInOutput}))).sort((a,b)=>b.bytes-a.bytes);
await writeFile(path.join(output,'module-contributions.json'),JSON.stringify({wrangler:contributions.slice(0,40),openNext:handlerContributions.slice(0,40)},null,2));
console.log('Results:',path.join(output,'requests.json'));
