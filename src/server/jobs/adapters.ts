import { mkdir, writeFile, link, unlink, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

export interface NotificationAdapter {
  deliver(key: string, message: Record<string, unknown>, signal: AbortSignal): Promise<void>;
}
export interface PrivateStorageAdapter {
  put(key: string, bytes: Uint8Array, signal: AbortSignal): Promise<void>;
}
export class LocalPrivateStorage implements PrivateStorageAdapter {
  constructor(private readonly directory = resolve(".local/notifications")) {}
  async put(key: string, bytes: Uint8Array, signal: AbortSignal) {
    if (!/^[a-f0-9-]{36}\.json$/.test(key)) throw new Error("Invalid local storage key");
    signal.throwIfAborted();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = resolve(this.directory, `${key}.${randomUUID()}.tmp`),
      destination = resolve(this.directory, key);
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600, signal });
      signal.throwIfAborted();
      try {
        await link(temporary, destination);
      } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") throw error;
        if (!Buffer.from(bytes).equals(await readFile(destination)))
          throw new Error("Local delivery idempotency conflict", { cause: error });
      }
    } finally {
      await unlink(temporary).catch((error) => {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      });
    }
  }
}
const messageSchema = z.discriminatedUnion("template", [
  z
    .object({
      template: z.literal("invitation"),
      to: z.email(),
      token: z.string().min(32).max(128),
    })
    .strict(),
  z
    .object({
      template: z.enum(["password-reset", "email-verification"]),
      to: z.email(),
      url: z.url().max(2048),
    })
    .strict(),
]);
export class LocalNotifications implements NotificationAdapter {
  constructor(private readonly storage: PrivateStorageAdapter = new LocalPrivateStorage()) {}
  async deliver(key: string, message: Record<string, unknown>, signal: AbortSignal) {
    const checked = messageSchema.parse(message);
    await this.storage.put(
      `${key}.json`,
      Buffer.from(JSON.stringify({ adapter: "local-private-sink", ...checked }, null, 2)),
      signal,
    );
  }
}
