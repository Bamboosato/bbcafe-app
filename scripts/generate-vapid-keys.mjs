import crypto from "node:crypto";

const { privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const jwk = privateKey.export({ format: "jwk" });

if (!jwk.x || !jwk.y || !jwk.d) {
  console.error("Failed to generate VAPID key material.");
  process.exit(1);
}

const publicKey = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(jwk.x, "base64url"),
  Buffer.from(jwk.y, "base64url"),
]).toString("base64url");

console.log("Set these values in the production environment:");
console.log(`WEB_PUSH_PUBLIC_KEY=${publicKey}`);
console.log(`WEB_PUSH_PRIVATE_KEY=${jwk.d}`);
console.log("WEB_PUSH_SUBJECT=mailto:your-contact@example.com");
