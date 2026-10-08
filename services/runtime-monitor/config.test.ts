import { expect, it } from "vitest";
import { readConfig } from "./config";
const env = {
  MONITOR_TARGET_ORIGIN: "https://site.test", MONITOR_CF_ACCOUNT_TAG: "a".repeat(32),
  MONITOR_CF_SCRIPT_NAME: "talk-theme-maker", MONITOR_READINESS_TOKEN: "r".repeat(32),
  MONITOR_STATE_BUCKET: "fixture-bucket", MONITOR_CF_API_TOKEN: "private-token",
  MONITOR_FAILURE_CHECKS: "2", MONITOR_RECOVERY_CHECKS: "2", MONITOR_COOLDOWN_SECONDS: "300",
  MONITOR_RUNTIME_FAILURE_COUNT: "5", MONITOR_RUNTIME_FAILURE_PERCENT: "5",
};
it("requires explicit policy and keeps delivery disabled unless explicitly enabled", () => {
  expect(readConfig(env).alertsEnabled).toBe(false);
  expect(() => readConfig({ ...env, MONITOR_FAILURE_CHECKS: undefined })).toThrow("monitor_configuration_missing");
  expect(() => readConfig({ ...env, MONITOR_ALERTS_ENABLED: "1" })).toThrow("monitor_configuration_missing");
});
it.each(["http://site.test", "https://user:password@site.test", "https://site.test/?secret=private", "https://site.test/path", "https://site.test/#private"])("rejects unsafe origin %s", origin => {
  expect(() => readConfig({ ...env, MONITOR_TARGET_ORIGIN: origin })).toThrow();
});
