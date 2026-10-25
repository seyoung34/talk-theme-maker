import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TargetInput = {
  readonly targetKind: "exact_role" | "asset_kind";
  readonly slotRole?: string;
  readonly priority: number;
};

const exactAssetId = "99999999-8888-4777-8666-555555555555";
const duplicateAssetId = "88888888-7777-4666-8555-444444444444";

function target(assetId: string, input: TargetInput) {
  return {
    id: `${assetId}-${input.targetKind}-${input.priority}`,
    asset_id: assetId,
    platform: "all",
    slot_role: input.slotRole ?? null,
    target_kind: input.targetKind,
    priority: input.priority,
    enabled: true,
  };
}

function sourceRow(id: string, targets: readonly TargetInput[]) {
  return {
    id,
    slot_role: "main_background",
    platform: "android",
    asset_kind: "background",
    analysis: null,
    bubble_adjustment: null,
    title: id,
    note: null,
    tags: [],
    file_name: `${id}.png`,
    mime_type: "image/png",
    storage_path: `admin-assets/${id}/background.png`,
    asset_object_id: null,
    enabled: true,
    created_at: "2026-08-22T00:00:00.000Z",
    updated_at: "2026-08-22T00:00:00.000Z",
    admin_asset_targets: targets.map((item) => target(id, item)),
    admin_asset_bubble_specs: [],
    admin_asset_variants: [],
  };
}

function sourceKindRow(id: string, assetKind: "background" | "bubble" | "icon", targets: readonly TargetInput[]) {
  return {
    ...sourceRow(id, targets),
    asset_kind: assetKind,
    slot_role: targets.find((item) => item.slotRole)?.slotRole ?? (assetKind === "bubble" ? "bubble_me_1" : "theme_icon"),
  };
}

describe("GET /api/theme-assets/recommended", () => {
  let createAdminClient: ReturnType<typeof vi.fn>;
  let createRegistryStore: ReturnType<typeof vi.fn>;
  let findActiveByKeys: ReturnType<typeof vi.fn>;
  let rangeStarts: number[];
  let signedPaths: string[][];
  let signTtls: number[];
  let sourceFailures: number;
  let thumbnailRows: unknown[];
  let previewOrigin: string | undefined;

  async function load(rows: readonly unknown[][], cap = 1000) {
    vi.resetModules();
    const source = rows.flat();
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "theme_asset_objects") {
          const query = {select:()=>query,eq:()=>query,in:async()=>({data:thumbnailRows,error:null})};
          return query;
        }
        if (table === "admin_assets") {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            order: vi.fn(() => query),
            range: vi.fn(async (start: number, end: number) => {
              rangeStarts.push(start);
              if (sourceFailures-- > 0) return {data:null,error:{message:"fixture source error"}};
              return { data: source.slice(start, start + Math.min(cap, end - start + 1)), error: null };
            }),
          };
          return query;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      storage: {
        from: vi.fn(() => ({
          createSignedUrls: vi.fn(async (paths: string[], ttl: number) => {
            signedPaths.push(paths);
            signTtls.push(ttl);
            return {
              data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${encodeURIComponent(path)}` })),
              error: null,
            };
          }),
        })),
      },
    };
    createAdminClient = vi.fn(() => admin);
    findActiveByKeys = vi.fn(async () => []);
    createRegistryStore = vi.fn(() => ({ findActiveByKeys }));
    vi.doMock("@/lib/supabase/server", () => ({ createAdminClient }));
    vi.doMock("@/lib/theme/assetCatalog/registryStore", () => ({ createRegistryStore }));
    vi.doMock("@/lib/theme/assetCatalog/previewUrl", () => ({
      getR2PreviewOrigin: () => previewOrigin,
      previewUrlOf: ({r2ObjectKey}: {r2ObjectKey?:string}) => previewOrigin && r2ObjectKey ? `${previewOrigin}/${r2ObjectKey}` : undefined,
    }));
    vi.doMock("@/lib/theme/assetCatalog/exportGate", () => ({
      isCatalogExportAssetAllowed: vi.fn(() => true),
      warnOnCatalogExportScopeDrift: vi.fn(),
    }));
    return (await import("@/app/api/theme-assets/recommended/route")).GET;
  }

  beforeEach(() => {
    rangeStarts = [];
    signedPaths = [];
    signTtls = [];
    sourceFailures = 0;
    thumbnailRows = [];
    previewOrigin = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    for (const moduleName of [
      "@/lib/supabase/server",
      "@/lib/theme/assetCatalog/registryStore",
      "@/lib/theme/assetCatalog/previewUrl",
      "@/lib/theme/assetCatalog/exportGate",
    ]) vi.doUnmock(moduleName);
  });

  it("200개를 넘는 source를 모두 읽고 전역 rank와 중복 제거 후 페이지를 자른다", async () => {
    const firstBatch = Array.from({ length: 200 }, (_, index) => {
      if (index === 0) {
        return sourceRow(duplicateAssetId, [
          { targetKind: "asset_kind", priority: 9 },
          { targetKind: "exact_role", slotRole: "main_background", priority: 9 },
        ]);
      }
      return sourceRow(`asset-${String(index).padStart(3, "0")}`, [{ targetKind: "asset_kind", priority: 0 }]);
    });
    const secondBatch = [
      sourceRow(exactAssetId, [{ targetKind: "exact_role", slotRole: "main_background", priority: 10 }]),
      sourceRow("tail-asset", [{ targetKind: "asset_kind", priority: 0 }]),
    ];
    const GET = await load([firstBatch, secondBatch], 200);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=main_background&limit=50"),
    } as never);
    const payload = await response.json();
    const ids = payload.items.map((item: { id: string }) => item.id);

    expect(response.status).toBe(200);
    expect(rangeStarts).toEqual([0, 200, 202]);
    expect(ids[0]).toBe(exactAssetId);
    expect(ids.filter((id: string) => id === duplicateAssetId)).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(payload.items[0]).toMatchObject({ matchRank: 0, target: { priority: 10 } });
    expect(payload.nextCursor).toEqual(expect.any(String));
    expect(signedPaths).toHaveLength(1);
    expect(findActiveByKeys).toHaveBeenCalledTimes(1);
  });

  it("호환되지 않는 exact_role target은 그 슬롯에서 제외한다", async () => {
    const GET = await load([[
      sourceRow("kind-target", [{ targetKind: "asset_kind", priority: 0 }]),
      sourceRow("other-exact", [{ targetKind: "exact_role", slotRole: "passcode_background", priority: 10 }]),
    ]]);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=main_background"),
    } as never);
    const payload = await response.json();

    expect(payload.items.map((item: { id: string }) => item.id)).toEqual(["kind-target"]);
  });

  it("일반 icon kind 후보를 암호 표시 슬롯에 추천한다", async () => {
    const iconRow = {
      ...sourceRow("icon-target", [{ targetKind: "asset_kind", priority: 0 }]),
      asset_kind: "icon",
      slot_role: "theme_icon",
    };
    const GET = await load([[
      iconRow,
    ]]);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=icon&slotRole=passcode_indicator_1"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items.map((item: { id: string }) => item.id)).toEqual(["icon-target"]);
  });

  it("같은 family 역할은 페이지 순서와 cursor를 공유하고 서버 작업을 재사용한다", async () => {
    const rows = [
      sourceKindRow("11111111-1111-4111-8111-111111111111", "background", [
        { targetKind: "exact_role", slotRole: "chat_background", priority: 5 },
      ]),
      sourceKindRow("22222222-2222-4222-8222-222222222222", "background", [
        { targetKind: "exact_role", slotRole: "main_background", priority: 4 },
      ]),
      sourceKindRow("33333333-3333-4333-8333-333333333333", "background", [
        { targetKind: "asset_kind", priority: 3 },
      ]),
    ];
    const GET = await load([rows]);
    const request = (role: string, cursor?: string) => GET({
      nextUrl: new URL(`http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=${role}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    } as never);

    const firstMain = await (await request("main_background")).json();
    const firstChat = await (await request("chat_background")).json();
    expect(firstChat.items.map((item: { id: string }) => item.id)).toEqual(firstMain.items.map((item: { id: string }) => item.id));
    expect(firstChat.nextCursor).toBe(firstMain.nextCursor);

    const secondTab = await (await request("tab_background_image", firstMain.nextCursor)).json();
    const secondMain = await (await request("main_background", firstMain.nextCursor)).json();
    expect(secondTab.items.map((item: { id: string }) => item.id)).toEqual(secondMain.items.map((item: { id: string }) => item.id));
    expect(secondTab.nextCursor).toBe(secondMain.nextCursor);
    expect(rangeStarts).toEqual([0, 3]);
    expect(signedPaths).toHaveLength(2);
    expect(findActiveByKeys).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["android", "bubble", "bubble_me_1", "bubble_you_2"],
    ["ios", "bubble", "bubble_me_1", "bubble_me_1_selected"],
    ["android", "icon", "theme_icon", "passcode_indicator_1"],
  ] as const)("%s %s family의 역할별 요청이 같은 첫 페이지를 만든다", async (platform, assetKind, firstRole, secondRole) => {
    const rows = [
      sourceKindRow("11111111-aaaa-4111-8111-111111111111", assetKind, [
        { targetKind: "exact_role", slotRole: firstRole, priority: 2 },
      ]),
      sourceKindRow("22222222-bbbb-4222-8222-222222222222", assetKind, [
        { targetKind: "exact_role", slotRole: secondRole, priority: 1 },
      ]),
      sourceKindRow("33333333-cccc-4333-8333-333333333333", assetKind, [
        { targetKind: "asset_kind", priority: 0 },
      ]),
    ];
    const GET = await load([rows]);
    const request = (role: string) => GET({
      nextUrl: new URL(`http://localhost/api/theme-assets/recommended?platform=${platform}&assetKind=${assetKind}&slotRole=${role}&limit=2`),
    } as never);

    const first = await (await request(firstRole)).json();
    const second = await (await request(secondRole)).json();

    expect(second.items.map((item: { id: string }) => item.id)).toEqual(first.items.map((item: { id: string }) => item.id));
    expect(second.nextCursor).toBe(first.nextCursor);
    expect(rangeStarts).toEqual([0, 3]);
  });

  it("family 밖 icon 역할은 서로 다른 추천 풀을 유지한다", async () => {
    const rows = [
      sourceKindRow("44444444-4444-4444-8444-444444444444", "icon", [
        { targetKind: "exact_role", slotRole: "theme_icon", priority: 2 },
      ]),
      sourceKindRow("55555555-5555-4555-8555-555555555555", "icon", [
        { targetKind: "exact_role", slotRole: "splash", priority: 2 },
      ]),
    ];
    const GET = await load([rows]);

    const family = await (await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=icon&slotRole=theme_icon"),
    } as never)).json();
    const splash = await (await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=icon&slotRole=splash"),
    } as never)).json();

    expect(family.items.map((item: { id: string }) => item.id)).toEqual(["44444444-4444-4444-8444-444444444444"]);
    expect(splash.items.map((item: { id: string }) => item.id)).toEqual(["55555555-5555-4555-8555-555555555555"]);
    expect(rangeStarts).toEqual([0, 2]);
  });

  /**
   * 랭킹 평탄화 전에 발급된 cursor는 버전 토큰이 없다. rank 값만 보면 그중 0과 1은 새 계산에서도
   * "유효한 값"이라 그대로 통과하고, 정렬이 바뀐 탓에 조용히 후보를 건너뛴다 — 이 테스트가 그 회귀를 잡는다.
   */
  it.each(["0", "1", "2"])("버전 토큰이 없는 rank %s cursor는 첫 페이지 요청으로 복구한다", async (legacyRank) => {
    const GET = await load([[
      sourceRow("66666666-6666-4666-8666-666666666666", [{ targetKind: "asset_kind", priority: 0 }]),
    ]]);
    const legacyCursor = encodeURIComponent(`${legacyRank}|0|0|77777777-7777-4777-8777-777777777777`);
    const response = await GET({
      nextUrl: new URL(`http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=main_background&cursor=${legacyCursor}`),
    } as never);

    expect((await response.json()).items.map((item: { id: string }) => item.id))
      .toEqual(["66666666-6666-4666-8666-666666666666"]);
  });

  it("발급하는 cursor에 버전 토큰을 붙이고 그 cursor로 다음 페이지를 이어 준다", async () => {
    const rows = [
      sourceRow("11111111-1111-4111-8111-111111111111", [{ targetKind: "exact_role", slotRole: "main_background", priority: 5 }]),
      sourceRow("22222222-2222-4222-8222-222222222222", [{ targetKind: "asset_kind", priority: 3 }]),
    ];
    const GET = await load([rows]);
    const request = (cursor?: string) => GET({
      nextUrl: new URL(`http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=main_background&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    } as never);

    const first = await (await request()).json();
    expect(first.items.map((item: { id: string }) => item.id)).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(first.nextCursor.split("|")[0]).toBe("v2");

    const second = await (await request(first.nextCursor)).json();
    expect(second.items.map((item: { id: string }) => item.id)).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });

  it("slotRole이 없으면 exact_role target은 빼고 kind 전체 후보만 내려준다", async () => {
    const GET = await load([[
      sourceRow("kind-target", [{ targetKind: "asset_kind", priority: 0 }]),
      sourceRow(exactAssetId, [{ targetKind: "exact_role", slotRole: "main_background", priority: 10 }]),
    ]]);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=background"),
    } as never);
    const payload = await response.json();

    expect(payload.items.map((item: { id: string }) => item.id)).toEqual(["kind-target"]);
  });

  it("잘못된 platform과 assetKind는 DB 조회 전에 거부한다", async () => {
    const GET = await load([[]]);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/theme-assets/recommended?platform=windows&assetKind=background"),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Valid platform and assetKind are required." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("1207개 source의 동률 정렬과 v2 cursor가 모든 페이지를 누락·중복 없이 잇는다", async () => {
    const rows=Array.from({length:1207},(_,i)=>({
      ...sourceRow(`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`,[{targetKind:i%3?"asset_kind":"exact_role",slotRole:i%3?undefined:"main_background",priority:i%5}]),
      updated_at:i%2?"2026-08-23T00:00:00.000Z":"2026-08-22T00:00:00.000Z",
    }));
    const GET=await load([rows]);
    const request=(cursor?:string)=>GET({nextUrl:new URL(`http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=main_background&limit=50${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`)} as never);
    const expected=rows.toSorted((a,b)=>{
      const x=a.admin_asset_targets[0],y=b.admin_asset_targets[0];
      return Number(x.target_kind==="asset_kind")-Number(y.target_kind==="asset_kind")||y.priority-x.priority||Date.parse(b.updated_at)-Date.parse(a.updated_at)||b.id.localeCompare(a.id);
    }).map(row=>row.id);
    const ids:string[]=[];let cursor:string|undefined;
    do {
      const payload=await (await request(cursor)).json();
      ids.push(...payload.items.map((item:{id:string})=>item.id));cursor=payload.nextCursor;
      if(cursor)expect(cursor).toMatch(/^v2\|/);
    }while(cursor);
    expect(ids).toEqual(expected);expect(new Set(ids).size).toBe(1207);
    expect(rangeStarts).toEqual([0,1000,1207]);
    expect(signTtls.every(ttl=>ttl===600)).toBe(true);
    expect(findActiveByKeys).toHaveBeenCalledTimes(25);
    const reset=await (await request("v2|invalid|0|0|bad")).json();
    expect(reset.items.map((item:{id:string})=>item.id)).toEqual(expected.slice(0,50));
    expect(rangeStarts).toEqual([0,1000,1207]);
  });

  it("동시 같은 페이지 miss를 합치고 각 응답의 registry는 새로 읽는다", async () => {
    const GET=await load([[sourceRow(exactAssetId,[{targetKind:"asset_kind",priority:0}])]]);
    const request=()=>GET({nextUrl:new URL("http://localhost/api/theme-assets/recommended?platform=android&assetKind=background")} as never);
    const payloads=await Promise.all(Array.from({length:8},async()=>{const response=await request();expect(response.headers.get("cache-control")).toBe("private, max-age=30");return response.json();}));
    for(const payload of payloads)expect(payload).toEqual(payloads[0]);
    expect(rangeStarts).toEqual([0,1]);expect(signedPaths).toHaveLength(1);
    expect(findActiveByKeys).toHaveBeenCalledTimes(8);
  });

  it("서로 다른 페이지·풀의 동시 miss도 source를 공유한다", async () => {
    const GET=await load([[sourceRow(exactAssetId,[{targetKind:"asset_kind",priority:0}])]]);
    await Promise.all([1,2,3,4].map(limit=>GET({nextUrl:new URL(`http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=unknown_${limit}&limit=${limit}`)} as never)));
    expect(rangeStarts).toEqual([0,1]);expect(signedPaths).toHaveLength(4);expect(findActiveByKeys).toHaveBeenCalledTimes(4);
  });

  it("source의 만료를 새 페이지가 연장하지 않고 실패 후 재시도한다", async () => {
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(1_000_000);
    const row=sourceRow(exactAssetId,[{targetKind:"asset_kind",priority:0}]);
    const GET=await load([[row]]);
    const request=(limit:number)=>GET({nextUrl:new URL(`http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&limit=${limit}`)} as never);
    expect((await (await request(1)).json()).items[0].title).toBe(exactAssetId);
    row.title="changed";vi.setSystemTime(1_029_999);
    expect((await (await request(2)).json()).items[0].title).toBe(exactAssetId);
    expect(rangeStarts).toEqual([0,1]);
    vi.setSystemTime(1_030_000);sourceFailures=1;
    const failed=await request(2);expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({error:"Failed to load recommended assets."});
    expect((await (await request(2)).json()).items[0].title).toBe("changed");
    expect(rangeStarts).toEqual([0,1,0,0,1]);
  });

  it("128페이지 상한에서 오래된 페이지를 내보내고 source는 재사용한다", async () => {
    const GET=await load([[sourceRow(exactAssetId,[{targetKind:"asset_kind",priority:0}])]]);
    const request=(index:number)=>GET({nextUrl:new URL(`http://localhost/api/theme-assets/recommended?platform=android&assetKind=background&slotRole=unknown_${index}`)} as never);
    for(let i=0;i<129;i++)await request(i);
    expect(signedPaths).toHaveLength(129);await request(0);expect(signedPaths).toHaveLength(130);
    expect(rangeStarts).toEqual([0,1]);
  });

  it("동률 target 선택과 플랫폼 variant·thumbnail·registry freshness를 보존한다", async () => {
    const row=sourceRow(exactAssetId,[{targetKind:"exact_role",slotRole:"main_background",priority:7},{targetKind:"exact_role",slotRole:"chat_background",priority:7}]);
    const GET=await load([[{
      ...row,asset_object_id:"canonical-object",
      admin_asset_targets:row.admin_asset_targets.map((target,index)=>({...target,id:index?"z-target":"a-target"})),
      admin_asset_variants:[{id:"variant",platform:"ios",storage_path:"ios.png",asset_object_id:"ios-object",file_name:"ios.png",mime_type:"image/png",analysis:{width:400,height:800}}],
    }]]);
    previewOrigin="https://preview.test";
    thumbnailRows=[{id:"canonical-object",logical_asset_id:`admin:${exactAssetId}`,variant_key:"canonical",r2_previews:{picker:{objectKey:"wrong.webp"}}},{id:"ios-object",logical_asset_id:`admin:${exactAssetId}`,variant_key:"ios",r2_previews:{picker:{objectKey:"ios.webp"}}}];
    findActiveByKeys.mockResolvedValue([{id:"ios-object",logicalAssetId:`admin:${exactAssetId}`,variantKey:"ios",revision:1,fileName:"ios.png",mimeType:"image/png",sizeBytes:10,sourceScale:1,width:400,height:800,pngSignatureVerified:true}]);
    const request=()=>GET({nextUrl:new URL("http://localhost/api/theme-assets/recommended?platform=ios&assetKind=background&slotRole=main_background")} as never);
    const first=(await (await request()).json()).items[0];
    expect(first).toMatchObject({storagePath:"ios.png",previewUrl:"https://signed.test/ios.png",thumbnailUrl:"https://preview.test/ios.webp",target:{id:"a-target"},catalog:{selection:{variantKey:"ios",revision:1}}});
    expect(first.variants[0].assetId).toBe(exactAssetId);
    findActiveByKeys.mockResolvedValue([]);
    const second=(await (await request()).json()).items[0];expect(second.catalog).toBeUndefined();expect(second.thumbnailUrl).toBe(first.thumbnailUrl);
    expect(signedPaths).toHaveLength(1);expect(signTtls).toEqual([600]);expect(findActiveByKeys).toHaveBeenCalledTimes(2);
  });
});
