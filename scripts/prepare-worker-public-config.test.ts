// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
const script=path.resolve("scripts/prepare-worker-public-config.mjs");
const {NEXT_PUBLIC_SUPABASE_URL:_url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:_key,...baseEnv}=process.env;
function run(root:string,env:Record<string,string>={}) {
  return execFileSync(process.execPath,[script],{cwd:root,stdio:"pipe",env:{...baseEnv,...env}});
}
const roots:string[]=[];
function fixture(url:unknown="https://fixture.invalid",key:unknown="public-key") {
  const root=mkdtempSync(path.join(tmpdir(),"public-config-"));roots.push(root);
  mkdirSync(path.join(root,".open-next/cloudflare"),{recursive:true});
  const values={NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SECRET_KEY:"must-not-copy",OTHER:"excluded"};
  writeFileSync(path.join(root,".open-next/cloudflare/next-env.mjs"),`export const production=${JSON.stringify(values)};`);
  return {root,values};
}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
it("extracts the exact Next build values and no other keys",()=>{
  const {root,values}=fixture();run(root);
  const source=readFileSync(path.join(root,".worker-public-config.mjs"),"utf8");
  const config=JSON.parse(source.slice(source.indexOf("{"),source.lastIndexOf("}")+1));
  expect(config).toEqual({NEXT_PUBLIC_SUPABASE_URL:values.NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY});
  expect(source).not.toContain("must-not-copy");expect(source).not.toContain("OTHER");
});
it.each([[undefined,"key"],["http://fixture.invalid","key"],["not-url","key"],["https://fixture.invalid",""]])("rejects invalid public build settings %s",(url,key)=>{
  const {root}=fixture(url===undefined?null:url,key);
  expect(()=>run(root)).toThrow();
});
// Workers Builds provides NEXT_PUBLIC_* as build variables without .env files.
it("prefers build process values over env-file values, as Next does",()=>{
  const {root}=fixture(null,null);
  run(root,{NEXT_PUBLIC_SUPABASE_URL:"https://build.invalid",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"build-key",SUPABASE_SECRET_KEY:"must-not-copy"});
  const source=readFileSync(path.join(root,".worker-public-config.mjs"),"utf8");
  expect(source).toContain("https://build.invalid");expect(source).toContain("build-key");expect(source).not.toContain("must-not-copy");
  const {root:fileRoot}=fixture();
  run(fileRoot,{NEXT_PUBLIC_SUPABASE_URL:"https://build.invalid",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"build-key"});
  expect(readFileSync(path.join(fileRoot,".worker-public-config.mjs"),"utf8")).not.toContain("fixture.invalid");
});
