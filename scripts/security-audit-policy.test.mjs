import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAudit } from "./security-audit-policy.mjs";
import { decodeAuditResult } from "./security-audit-result.mjs";

const now = Date.parse("2026-10-06T01:00:00Z");
function fixture() {
  const advisory = "GHSA-vfj7-8cjw-p6xm";
  const lock = { lockfileVersion: 3, packages: {
    "node_modules/braces": { version: "3.0.3", dev: true },
    "node_modules/parent": { version: "1.0.0", dev: true },
  } };
  const report = { auditReportVersion: 2, vulnerabilities: {
    braces: { name: "braces", severity: "high", nodes: ["node_modules/braces"], via: [{ url: `https://github.com/advisories/${advisory}`, severity: "high" }] },
    parent: { name: "parent", severity: "high", nodes: ["node_modules/parent"], via: ["braces"] },
  }, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 } } };
  const config = { exceptions: [{ advisory, createdAt: "2026-10-06T00:00:00Z", expiresAt: "2026-11-05T00:00:00Z", owner: "test", reason: "dev-only fixture", packages: Object.entries(lock.packages).map(([path, pkg]) => ({ name: path.slice(13), path, version: pkg.version })) }] };
  return { report, lock, config };
}
const check = ({ report, lock, config }, options = {}) => evaluateAudit(report, lock, config, { now, ...options });

test("clean audits pass without exceptions", () => {
  const f = fixture(); f.report.vulnerabilities = {};
  f.report.metadata.vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  f.config.exceptions = [];
  assert.equal(check(f, { production: true }).ok, true);
});
test("only the exact dev chain is accepted; production never uses exceptions", () => {
  const f = fixture(); assert.equal(check(f).allowed.length, 2);
  assert.equal(check(f, { production: true }).ok, false);
});
test("exception expires at the exact UTC boundary", () => {
  const f = fixture(), expiry = Date.parse(f.config.exceptions[0].expiresAt);
  assert.equal(check(f, { now: expiry - 1 }).ok, true);
  assert.equal(check(f, { now: expiry }).ok, false);
  assert.equal(check(f, { now: expiry + 1 }).ok, false);
});
test("package becomes production or version/path changes: previous success becomes failure", () => {
  for (const mutate of [
    (f) => { delete f.lock.packages["node_modules/braces"].dev; },
    (f) => { f.lock.packages["node_modules/braces"].version = "3.0.4"; },
    (f) => { const path = "node_modules/parent/node_modules/braces"; f.lock.packages[path] = { version: "3.0.3", dev: true }; f.report.vulnerabilities.braces.nodes.push(path); },
  ]) { const f = fixture(); assert.equal(check(f).ok, true); mutate(f); assert.equal(check(f).ok, false); }
});
test("new advisory or critical severity cannot use an old exception", () => {
  for (const mutate of [
    (f) => f.report.vulnerabilities.braces.via.push({ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "high" }),
    (f) => { f.report.vulnerabilities.braces.severity = "critical"; f.report.metadata.vulnerabilities.high--; f.report.metadata.vulnerabilities.critical++; },
    (f) => { f.report.vulnerabilities.braces.via[0].severity = "critical"; },
  ]) { const f = fixture(); mutate(f); assert.equal(check(f).ok, false); }
});
test("cycles, missing via, duplicate nodes and malformed advisories fail closed", () => {
  for (const via of [["parent"], ["missing"], [{}], [{ url: "https://example.com/GHSA-vfj7-8cjw-p6xm", severity: "high" }]]) {
    const f = fixture(); f.report.vulnerabilities.braces.via = via; assert.equal(check(f).ok, false);
  }
  const f = fixture(); f.report.vulnerabilities.braces.nodes.push("node_modules/braces"); assert.equal(check(f).ok, false);
});
test("registry errors, missing fields and inconsistent totals are not zero vulnerabilities", () => {
  for (const mutate of [
    (f) => { f.report = { error: { code: "ENOTFOUND" } }; },
    (f) => { f.report.auditReportVersion = 1; },
    (f) => { delete f.report.metadata; },
    (f) => { f.report.metadata.vulnerabilities.total = 0; },
    (f) => { f.report.metadata.vulnerabilities.high = 0; },
    (f) => { f.report.vulnerabilities.braces.nodes = []; },
    (f) => { f.config = {}; },
    (f) => { f.lock.packages = null; },
  ]) { const f = fixture(); mutate(f); assert.equal(check(f).ok, false); }
});
test("exception requires a reason, owner, UTC dates and maximum 30-day duration", () => {
  for (const mutate of [
    (e) => { e.owner = ""; }, (e) => { e.reason = ""; },
    (e) => { e.createdAt = "2026-10-07T00:00:00Z"; },
    (e) => { e.expiresAt = "2026-11-06T00:00:00Z"; },
    (e) => { e.expiresAt = "invalid"; },
    (e) => { e.packages.push(e.packages[0]); },
    (e) => { e.packages.push(null); },
  ]) { const f = fixture(); mutate(f.config.exceptions[0]); assert.equal(check(f).ok, false); }
});

test("network errors, timeouts, malformed output and inconsistent npm exit codes always fail", () => {
  const f = fixture(), stdout = JSON.stringify(f.report);
  for (const result of [
    { status: 0, stdout }, // Findings require exit 1 even when a dev exception accepts them.
    { status: 2, stdout },
    { status: null, stdout, error: { code: "ETIMEDOUT" } },
    { status: 1, stdout: "not JSON" },
    { status: 1, stdout: "", error: { code: "ENOTFOUND" } },
    { status: 1, stdout: "null" },
  ]) {
    const { report, verdict } = decodeAuditResult(result, f.lock, f.config, { now });
    assert.equal(verdict.ok, false);
    assert.doesNotThrow(() => JSON.stringify(report)); // A failed request still has a savable report.
  }
  assert.equal(decodeAuditResult({ status: 1, stdout }, f.lock, f.config, { now }).verdict.ok, true);
});
