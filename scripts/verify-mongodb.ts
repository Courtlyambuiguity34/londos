import { mongoSettings, mongoClient } from "../src/server/services/config";
import {
  mongoRoundTrip,
  MongoProbeError,
  probeCollection,
  publicCopyCollection,
} from "../src/server/services/mongo-probe";
import { loadLocalEnv } from "./local-env";
loadLocalEnv();
let client: ReturnType<typeof mongoClient> | undefined;
const report: Record<string, unknown> = {
  event: "mongodb.verification",
  checkedAt: new Date().toISOString(),
  credentialPresent: !!(process.env.MONGODB_URL || process.env.MONGODB_URI),
  connected: false,
  canonicalDatabase: "postgresql",
  migrationPerformed: false,
  redisRequired: false,
};
try {
  const settings = mongoSettings();
  report.source = settings.source;
  report.database = settings.database;
  report.atlas = settings.atlas;
  report.tlsRequired = !settings.local;
  client = mongoClient(settings);
  await client.connect();
  const db = client.db(settings.database);
  await db.command({ ping: 1 });
  report.connected = true;
  // List only Londos collections, not unrelated provider/account metadata.
  report.existingCollections = (
    await db
      .listCollections(
        { name: { $in: [probeCollection, publicCopyCollection] } },
        { nameOnly: true },
      )
      .toArray()
  ).map((c) => c.name);
  // Check access without exporting any catalogue record or its contents.
  await db
    .collection<{ _id: string }>(publicCopyCollection)
    .findOne({ _id: "londos-nonexistent-connection-check" });
  report.publicCopyCollectionReadable = true;
  report.crudCollection = probeCollection;
  report.crud = await mongoRoundTrip(db);
  report.result = "passed";
} catch (error) {
  report.result = report.credentialPresent ? "failed" : "not-executed";
  report.code =
    error instanceof MongoProbeError
      ? "round_trip_or_cleanup_failed"
      : report.credentialPresent
        ? "configuration_or_connection_unavailable"
        : "credential_not_delivered";
  if (error instanceof MongoProbeError) report.crud = error.results;
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {
    report.result = "failed";
    report.code = "connection_cleanup_failed";
    process.exitCode = 1;
  });
}
console.log(JSON.stringify(report));
