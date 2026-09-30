import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// The mail server password is stored encrypted with a key derived from the app's own secret, so
// the database alone does not give it away. Changing BETTER_AUTH_SECRET means entering it again.
const key = () => createHash("sha256").update(`mail-password:${process.env.BETTER_AUTH_SECRET ?? ""}`).digest();

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

/** The password, or null when it cannot be read (for example after the secret changed). */
export function unseal(sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
