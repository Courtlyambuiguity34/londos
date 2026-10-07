import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, lstat, readFile, writeFile, appendFile, link, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const magic = Buffer.from("LONDOS-BACKUP-1\n"),
  headerSize = magic.length + 12;

export async function recoveryKey(path: string): Promise<Buffer> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw new Error("Recovery key must be a private regular file");
  const bytes = await readFile(path);
  if (bytes.length !== 32) throw new Error("Recovery key must contain 32 random bytes");
  return bytes;
}

// Encrypt an already closed archive. The authenticated header and final tag bind
// the complete ciphertext; decrypt never releases a file before authentication.
export async function seal(source: string, destination: string, key: Buffer) {
  if (key.length !== 32) throw new Error("Invalid recovery key size");
  const nonce = randomBytes(12),
    header = Buffer.concat([magic, nonce]),
    cipher = createCipheriv("aes-256-gcm", key, nonce),
    temporary = `${destination}.${randomBytes(12).toString("hex")}.partial`;
  cipher.setAAD(header);
  try {
    await writeFile(temporary, header, { flag: "wx", mode: 0o600 });
    await pipeline(createReadStream(source), cipher, createWriteStream(temporary, { flags: "a" }));
    await appendFile(temporary, cipher.getAuthTag());
    const output = await open(temporary, "r+");
    try {
      await output.sync();
    } finally {
      await output.close();
    }
    // Atomic publication refuses to replace a previous backup.
    await link(temporary, destination);
  } catch (error) {
    throw new Error("Backup encryption failed", { cause: error });
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function unseal(source: string, destination: string, key: Buffer) {
  if (key.length !== 32) throw new Error("Invalid recovery key size");
  const info = await lstat(source);
  if (!info.isFile() || info.size < headerSize + 16) throw new Error("Invalid encrypted backup");
  const input = await open(source, "r"),
    header = Buffer.alloc(headerSize),
    tag = Buffer.alloc(16);
  try {
    await input.read(header, 0, headerSize, 0);
    await input.read(tag, 0, 16, info.size - 16);
  } finally {
    await input.close();
  }
  if (!header.subarray(0, magic.length).equals(magic)) throw new Error("Invalid encrypted backup");
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(magic.length)),
    temporary = `${destination}.${randomBytes(12).toString("hex")}.partial`;
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(source, { start: headerSize, end: info.size - 17 }),
      decipher,
      createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
    );
    await link(temporary, destination);
  } catch {
    throw new Error("Backup authentication failed; no archive released");
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
