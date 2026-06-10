import crypto from "node:crypto";

export function randomHex(bytes = 12) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function safeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function stableHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

export function createPasswordHash(password: string, iterations = defaultIterations()) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");

  return `pbkdf2:sha256:${iterations}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function encryptSecret(plainText: string) {
  const key = getAppEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

export function decryptSecret(encryptedValue: string) {
  const [ivValue, ciphertextValue, authTagValue] = encryptedValue.split(".");

  if (!ivValue || !ciphertextValue || !authTagValue) {
    throw new Error("Invalid encrypted secret format.");
  }

  const key = getAppEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));

  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function verifyPasswordHash(password: string, encodedHash: string) {
  const parts = encodedHash.split(":");

  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") {
    return false;
  }

  const iterations = Number(parts[2]);
  const salt = Buffer.from(parts[3] ?? "", "base64");
  const expected = Buffer.from(parts[4] ?? "", "base64");

  if (!Number.isInteger(iterations) || iterations <= 0 || !salt.length || !expected.length) {
    return false;
  }

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, expected.length, "sha256", (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });

  return safeStringEqual(derived.toString("base64"), expected.toString("base64"));
}

function defaultIterations() {
  const value = Number(process.env.PASSWORD_HASH_ITERATIONS ?? 210000);

  return Number.isInteger(value) && value > 0 ? value : 210000;
}

function getAppEncryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();

  if (!raw) {
    throw new Error("Missing required environment variable: APP_ENCRYPTION_KEY");
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return key;
}
