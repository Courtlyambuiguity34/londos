import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { z } from "zod";
import { loadLocalEnv } from "./local-env";
import { coreConfig } from "../src/server/config";
import { createAuth } from "../src/server/security/auth";
import { transaction } from "../src/server/db/pool";
import { requireDevelopmentDatabase } from "../src/server/db/development";
import { requiredMigration } from "../src/server/db/schema-contract";
import type { SeedAccounts } from "../src/server/db/seed";
loadLocalEnv();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await requireDevelopmentDatabase(pool);
  if (
    !(await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [requiredMigration]))
      .rowCount
  )
    throw new Error("Apply current migrations first.");
  const accounts = JSON.parse(
    await readFile(".local/development-accounts.json", "utf8"),
  ) as SeedAccounts;
  const existing = await pool.query(
    "SELECT 1 FROM \"user\" u JOIN operator_grants g ON g.user_id=u.id WHERE u.id=$1 AND u.email=$2 AND g.permission='review'",
    [accounts.operator.id, "operator@londos.example"],
  );
  if (!existing.rowCount)
    throw new Error("Fictional review operator identity does not match; no grant changed.");
  const email = "trust-reviewer@londos.example",
    file = ".local/trust-reviewer.json",
    identity = z
      .object({ id: z.string().min(1), email: z.literal(email), password: z.string().min(12) })
      .strict();
  let reviewer: z.infer<typeof identity> | undefined;
  try {
    reviewer = identity.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
  const previous = (await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0];
  if (previous && (!reviewer || reviewer.id !== previous.id))
    throw new Error(
      "Independent reviewer exists without matching private credentials; recover explicitly.",
    );
  if (reviewer && !previous)
    throw new Error("Private reviewer file has no matching identity; recover explicitly.");
  if (!reviewer) {
    const password = randomBytes(24).toString("base64url"),
      created = await createAuth(pool, coreConfig(), true).api.signUpEmail({
        body: { email, password, name: "Fictional independent trust reviewer" },
      });
    reviewer = { id: created.user.id, email, password };
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [reviewer.id]);
    await mkdir(".local", { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify(reviewer, null, 2), { mode: 0o600, flag: "wx" });
  }
  await transaction(pool, async (client) => {
    if ((await client.query("SELECT 1 FROM memberships WHERE user_id=$1", [reviewer.id])).rowCount)
      throw new Error("Independent development reviewer must have no merchant membership.");
    await client.query(
      "INSERT INTO operator_grants(user_id,permission) VALUES($1,'moderation'),($2,'moderation') ON CONFLICT DO NOTHING",
      [accounts.operator.id, reviewer.id],
    );
  });
  console.log(
    "Two fictional operators can claim scoped development trust cases after native MFA. Independent reviewer credentials are preserved in ignored .local/trust-reviewer.json (mode 600); no credentials printed. Live collection remains disabled.",
  );
} catch {
  console.error(
    "Local trust setup failed; no credentials printed. Check local identity, migrations and the private account file.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
