const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(userId) {
  const master = Buffer.from(process.env.ENCRYPTION_MASTER_KEY, "hex");
  return crypto.pbkdf2Sync(userId, master, 100000, 32, "sha256");
}

function encrypt(text, userId) {
  if (!text) return { enc: null, iv: null };
  const key = getKey(userId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

function decrypt(enc, iv, userId) {
  if (!enc || !iv) return null;
  try {
    const key = getKey(userId);
    const buf = Buffer.from(enc, "base64");
    const tag = buf.slice(buf.length - TAG_LENGTH);
    const data = buf.slice(0, buf.length - TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
