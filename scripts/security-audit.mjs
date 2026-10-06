import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeAuditResult } from "./security-audit-result.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../.security-audit/", import.meta.url);
mkdirSync(output, { recursive: true });
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const config = JSON.parse(readFileSync(new URL("../security-audit-exception.json", import.meta.url), "utf8"));
let failed = false;
for (const production of [true, false]) {
  const name = production ? "production" : "full";
  const args = ["audit", "--json", ...(production ? ["--omit=dev"] : [])];
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm", ...args], { cwd: root, encoding: "utf8", timeout: 180000, maxBuffer: 10 * 1024 * 1024 })
    : spawnSync("npm", args, { cwd: root, encoding: "utf8", timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
  const { report, verdict } = decodeAuditResult(result, lock, config, { production });
  writeFileSync(new URL(`${name}.json`, output), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(new URL(`${name}-policy.json`, output), JSON.stringify({ checkedAt: new Date().toISOString(), exitCode: result.status, ...verdict }, null, 2) + "\n");
  console.log(`${name}: ${verdict.ok ? "PASS" : "FAIL"}`);
  for (const line of [...verdict.errors, ...verdict.allowed]) console.log(`  ${line}`);
  failed ||= !verdict.ok;
}
process.exitCode = failed ? 1 : 0;
