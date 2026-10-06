import { evaluateAudit } from "./security-audit-policy.mjs";

export function decodeAuditResult(result, lock, config, options) {
  try {
    const report = JSON.parse(result.stdout);
    const verdict = evaluateAudit(report, lock, config, options);
    if (result.error || ![0, 1].includes(result.status) ||
        result.status !== (Object.keys(report.vulnerabilities ?? {}).length ? 1 : 0)) {
      verdict.ok = false;
      verdict.errors.push("npm audit could not complete with a consistent exit status");
    }
    return { report, verdict };
  } catch {
    return {
      report: { error: { code: result.error?.code ?? "INVALID_RESPONSE", message: "npm audit did not return valid JSON" } },
      verdict: { ok: false, errors: ["npm audit unavailable or returned invalid JSON"], allowed: [] },
    };
  }
}
