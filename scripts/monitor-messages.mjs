// 독립 감시기 텔레그램 문구 템플릿 도구.
//
//   npm run monitor:messages:check                 원본(또는 지정 파일)을 감시기와 같은 규칙으로 검증
//   npm run monitor:messages:preview               모든 출처·단계의 예시 메시지를 출력
//   npm run monitor:messages:push -- --yes         검증 후 운영 상태 버킷에 업로드(다음 tick부터 적용)
//   npm run monitor:messages:pull                  운영에 올라간 템플릿을 내려받아 원본과 비교
//
// 파일을 지정하려면 `-- --file <경로>`. 버킷은 MONITOR_STATE_BUCKET 또는 아래 기본값.
// 감시기 코드와 같은 검증·렌더러를 쓰도록 감시기 소스를 임시 폴더로 컴파일해서 불러온다.
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const defaultFile = path.join(root, "services/runtime-monitor/messages.ko.json");
const bucket = process.env.MONITOR_STATE_BUCKET || "kt-theme-runtime-monitor-state";
const objectName = "monitor/messages-v1.json";

const args = process.argv.slice(2);
const command = args[0];
const fileIndex = args.indexOf("--file");
const file = fileIndex >= 0 ? path.resolve(args[fileIndex + 1] ?? "") : defaultFile;

async function loadMonitor() {
  const outDir = path.join(root, "node_modules/.cache/runtime-monitor-messages");
  const tsc = path.join(root, "node_modules/typescript/bin/tsc");
  execFileSync(process.execPath, [tsc, "-p", "services/runtime-monitor/tsconfig.json", "--outDir", outDir], { cwd: root, stdio: "inherit" });
  const base = path.join(outDir, "services/runtime-monitor");
  const [messages, format, model] = await Promise.all(["messages.js", "format.js", "model.js"]
    .map(name => import(pathToFileURL(path.join(base, name)).href)));
  return { messages, format, model };
}

async function readCatalog(monitor, target) {
  const bytes = await readFile(target);
  if (bytes.length > monitor.messages.catalogByteLimit) throw new Error(`messages_invalid: 파일이 ${monitor.messages.catalogByteLimit}바이트를 넘습니다`);
  return monitor.messages.parseMessageCatalog(JSON.parse(bytes.toString("utf8")));
}

/** 출처 × 단계마다 실제와 같은 형태의 알림을 만든다. */
function examples(monitor) {
  const openedAt = Date.UTC(2026, 10, 15, 21, 30, 2);
  const at = openedAt + 35 * 60_000;
  const result = [];
  for (const source of monitor.model.sources) {
    const runtime = source === "cloudflare_runtime";
    const failureCode = runtime ? "runtime_failure_candidates" : source === "cloudflare_collector" ? "request_timeout" : "http_failed";
    const failed = {
      source, outcome: "failed", code: failureCode, observationId: String(runtime ? Math.floor(at / 300_000) * 300_000 : at), at,
      ...(runtime ? { requests: 120, failures: 9 } : {}),
      ...(source === "public_http" ? { httpStatus: 500, cfRay: "a5b17f78bea619ce-KIX" } : {}),
    };
    const healthy = { source, outcome: "healthy", code: runtime ? "runtime_window_observed" : "probe_ok", observationId: String(at), at };
    for (const [phase, layout, sample, time] of [
      ["opened", "opened", failed, openedAt], ["update", "update", failed, at], ["repeat", "repeat", failed, at],
      ["recovered", "recovered", healthy, at], ["recovered", "closed", healthy, at],
    ]) {
      result.push({ source, layout, event: { id: `${source}:${openedAt}:${phase}:${time}`, source, phase, at: time, openedAt, sample: { ...sample, at: time } } });
    }
  }
  return result;
}

function render(monitor, catalog) {
  return examples(monitor).map(({ source, layout, event }) => ({
    source, layout, text: monitor.format.formatNotification(event, catalog, layout),
  }));
}

function gcloud(argv, options = {}) {
  // Windows의 gcloud는 .cmd라 셸을 거쳐야 실행된다. 인자는 이 파일이 만든 고정값뿐이다.
  const windows = process.platform === "win32";
  // 셸을 거치므로 공백이 든 경로(예: "VS Code")는 따옴표로 감싼다.
  const quoted = windows ? argv.map(arg => /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg) : argv;
  const result = windows
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${["gcloud", ...quoted].join(" ")}"`], { windowsVerbatimArguments: true, encoding: "utf8", ...options })
    : spawnSync("gcloud", argv, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`gcloud ${argv[0]} ${argv[1]} 실패 (exit ${result.status})\n${result.stderr ?? ""}`);
  return result.stdout;
}

async function main() {
  if (!["check", "preview", "push", "pull"].includes(command)) {
    console.error("사용법: node scripts/monitor-messages.mjs <check|preview|push|pull> [--file <경로>] [--yes]");
    process.exit(2);
  }
  const monitor = await loadMonitor();

  if (command === "pull") {
    const temp = await mkdtemp(path.join(tmpdir(), "monitor-messages-"));
    let keep = false;
    try {
      const downloaded = path.join(temp, "messages-v1.json");
      try { gcloud(["storage", "cp", `gs://${bucket}/${objectName}`, downloaded]); } catch (error) {
        console.log(`운영 템플릿이 없거나 읽지 못했습니다. 감시기는 이미지에 든 원본 문구를 씁니다.\n${error.message}`);
        return;
      }
      const remote = await readFile(downloaded, "utf8");
      const local = await readFile(file, "utf8");
      const same = JSON.stringify(JSON.parse(remote)) === JSON.stringify(JSON.parse(local));
      console.log(same ? "운영 템플릿이 원본과 같습니다." : `운영 템플릿이 원본과 다릅니다. 내려받은 파일: ${downloaded}`);
      try { await readCatalog(monitor, downloaded); } catch (error) {
        console.log(`주의: 운영 템플릿이 검증을 통과하지 못합니다. 감시기는 원본 문구로 돌아간 상태입니다.\n${error.message}`);
      }
      keep = !same; // 다르면 비교할 수 있게 내려받은 파일을 남긴다.
    } finally {
      if (!keep) await rm(temp, { recursive: true, force: true }).catch(() => undefined);
    }
    return;
  }

  const catalog = await readCatalog(monitor, file);
  const rendered = render(monitor, catalog);
  const tooLong = rendered.filter(item => item.text.length >= monitor.messages.telegramTextLimit);
  if (tooLong.length) throw new Error(`messages_invalid: 텔레그램 길이 한도에 닿는 메시지 ${tooLong.map(i => `${i.source}/${i.layout}`).join(", ")}`);

  if (command === "preview") {
    for (const item of rendered) console.log(`──── ${item.source} / ${item.layout} ────\n${item.text}\n`);
    return;
  }
  console.log(`문구 템플릿 검증 통과: ${path.relative(root, file)} (예시 ${rendered.length}건 렌더링)`);
  if (command === "check") return;

  const target = `gs://${bucket}/${objectName}`;
  if (!args.includes("--yes")) {
    console.log(`업로드하지 않았습니다. 운영 감시기(${target})에 반영하려면 --yes를 붙여 다시 실행하세요.`);
    return;
  }
  gcloud(["storage", "cp", file, target, "--content-type=application/json", "--cache-control=no-store"], { stdio: ["ignore", "inherit", "inherit"] });
  console.log(`업로드 완료: ${target}. 감시기는 다음 tick(최대 5분)부터 이 문구를 씁니다.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
