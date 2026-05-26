import crypto from "node:crypto";

const password = process.argv[2];
const iterations = Number(process.argv[3] ?? 210000);

if (!password) {
  console.error("Usage: npm run hash-password -- <password> [iterations]");
  process.exit(1);
}

if (!Number.isInteger(iterations) || iterations <= 0) {
  console.error("iterations must be a positive integer");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");

console.log(`pbkdf2:sha256:${iterations}:${salt.toString("base64")}:${hash.toString("base64")}`);
