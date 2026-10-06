const severities = ["info", "low", "moderate", "high", "critical"];
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const ghsa = (url) => typeof url === "string" && /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)$/.exec(url)?.[1];

// Fail closed: a registry error or malformed response is never a clean audit.
export function evaluateAudit(report, lock, config, { production = false, now = Date.now() } = {}) {
  const errors = [];
  const allowed = [];
  const fail = (message) => { errors.push(message); };
  if (!isObject(report) || report.auditReportVersion !== 2 || report.error ||
      !isObject(report.vulnerabilities) || !isObject(report.metadata?.vulnerabilities)) {
    return { ok: false, errors: ["Invalid npm audit v2 response"], allowed };
  }
  if (!isObject(lock?.packages) || lock.lockfileVersion !== 3 || !Array.isArray(config?.exceptions)) {
    return { ok: false, errors: ["Invalid lockfile or exception configuration"], allowed };
  }
  const entries = Object.entries(report.vulnerabilities);
  const counts = Object.fromEntries(severities.map((severity) => [severity, 0]));
  for (const [name, finding] of entries) {
    if (!isObject(finding) || finding.name !== name || !severities.includes(finding.severity) ||
        !Array.isArray(finding.nodes) || !finding.nodes.length ||
        new Set(finding.nodes).size !== finding.nodes.length ||
        finding.nodes.some((node) => typeof node !== "string" || !isObject(lock.packages[node]) || !node.endsWith(`node_modules/${name}`)) ||
        !Array.isArray(finding.via) || !finding.via.length) {
      fail(`Invalid finding: ${name}`);
      continue;
    }
    counts[finding.severity] += 1;
  }
  for (const severity of severities) {
    if (report.metadata.vulnerabilities[severity] !== counts[severity]) fail(`Count mismatch: ${severity}`);
  }
  if (report.metadata.vulnerabilities.total !== entries.length) fail("Count mismatch: total");

  for (const exception of config.exceptions) {
    if (!isObject(exception) || !/^GHSA-[a-z0-9-]+$/.test(exception.advisory ?? "") ||
        typeof exception.owner !== "string" || !exception.owner.trim() ||
        typeof exception.reason !== "string" || !exception.reason.trim() ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(exception.createdAt ?? "") ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(exception.expiresAt ?? "") ||
        !Array.isArray(exception.packages) || !exception.packages.length) {
      fail("Invalid exception configuration");
      continue;
    }
    const created = Date.parse(exception.createdAt), expires = Date.parse(exception.expiresAt);
    if (!Number.isFinite(created) || !Number.isFinite(expires) || created > now ||
        expires <= now || expires <= created || expires - created > 30 * 86400000 ||
        new Date(created).toISOString() !== exception.createdAt.replace("Z", ".000Z") ||
        new Date(expires).toISOString() !== exception.expiresAt.replace("Z", ".000Z")) fail(`Invalid or expired exception: ${exception.advisory}`);
    const paths = new Set();
    for (const pkg of exception.packages) {
      if (!isObject(pkg) || typeof pkg.name !== "string" || typeof pkg.version !== "string" ||
          typeof pkg.path !== "string" || paths.has(pkg.path) ||
          !pkg.path.endsWith(`node_modules/${pkg.name}`) ||
          lock.packages[pkg.path]?.version !== pkg.version || lock.packages[pkg.path]?.dev !== true) {
        fail(`Exception does not match a dev-only lock entry: ${pkg?.path}`);
      }
      paths.add(pkg.path);
    }
  }
  if (errors.length) return { ok: false, errors, allowed };

  function advisories(name, visiting = new Set()) {
    if (visiting.has(name)) throw new Error(`Cyclic via: ${name}`);
    const finding = report.vulnerabilities[name];
    if (!finding) throw new Error(`Missing via finding: ${name}`);
    const path = new Set([...visiting, name]);
    return finding.via.flatMap((via) => {
      if (typeof via === "string") return advisories(via, path);
      const id = isObject(via) && ghsa(via.url);
      if (!id || !severities.includes(via.severity) || via.severity === "critical") throw new Error(`Invalid or critical advisory: ${name}`);
      return [id];
    });
  }
  for (const [name, finding] of entries) {
    if (production) { fail(`Production vulnerability: ${name} (${finding.severity})`); continue; }
    try {
      const ids = advisories(name);
      const exception = config.exceptions.find((item) => finding.severity !== "critical" &&
        ids.every((id) => id === item.advisory) && finding.nodes.every((node) =>
          item.packages.some((pkg) => pkg.path === node && pkg.name === name &&
            pkg.version === lock.packages[node].version && lock.packages[node].dev === true)));
      if (!exception) fail(`Unaccepted vulnerability: ${name} (${finding.severity})`);
      else allowed.push(`${name}: ${exception.advisory}, expires ${exception.expiresAt}`);
    } catch (error) { fail(error.message); }
  }
  return { ok: errors.length === 0, errors, allowed };
}
