// Test-only crash driver. It uses production transactions/claim/handlers and an
// IPC checkpoint so the parent can kill the process at an exact durable boundary.
import { Pool } from "pg";
import { transaction } from "../../src/server/db/pool";
import { enqueue } from "../../src/server/jobs/enqueue";
import { claim } from "../../src/server/jobs/queue";
import { handle } from "../../src/server/jobs/handlers";
import { LocalNotifications, LocalPrivateStorage } from "../../src/server/jobs/adapters";
import { seedIds } from "../../src/server/db/seed";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
if (process.argv[2] === "commit") {
  const jobId = await transaction(pool, (client) =>
    enqueue(client, {
      kind: "shop.profile.changed",
      key: process.env.LONDOS_CRASH_KEY!,
      merchantId: seedIds.merchantA,
      shopId: seedIds.shopA,
      payload: { shopId: seedIds.shopA, version: 1 },
    }),
  );
  process.send?.({ stage: "committed", jobId });
} else {
  const job = await claim(pool);
  if (!job) throw new Error("Crash driver had no eligible job.");
  await handle(
    pool,
    job,
    new LocalNotifications(new LocalPrivateStorage(process.env.LONDOS_CRASH_DIRECTORY!)),
    new AbortController().signal,
  );
  process.send?.({ stage: "effected", jobId: job.id });
}
await new Promise(() => {});
