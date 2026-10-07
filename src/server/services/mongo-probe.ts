import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

export const probeCollection = "londos_integration_checks";
export const publicCopyCollection = "londos_public_copies";
export type CrudResult = {
  write: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
  cleanup: boolean;
};
export class MongoProbeError extends Error {
  constructor(readonly results: CrudResult) {
    super("mongodb_round_trip_failed");
  }
}
export async function mongoRoundTrip(db: Db): Promise<CrudResult> {
  const result: CrudResult = {
    write: false,
    read: false,
    update: false,
    delete: false,
    cleanup: false,
  };
  const id = `londos-integration-check:${randomUUID()}`,
    marker = randomUUID();
  const documents = db.collection<{
    _id: string;
    marker: string;
    purpose: string;
    value: number;
    createdAt: Date;
  }>(probeCollection);
  const filter = { _id: id, marker };
  let attempted = false;
  try {
    attempted = true;
    const inserted = await documents.insertOne({
      ...filter,
      purpose: "temporary Londos connection verification; safe to remove",
      value: 1,
      createdAt: new Date(),
    });
    if (!inserted.acknowledged) throw new Error();
    result.write = true;
    if ((await documents.findOne(filter))?.value !== 1) throw new Error();
    result.read = true;
    if (
      (await documents.updateOne(filter, { $set: { value: 2 } })).modifiedCount !== 1 ||
      (await documents.findOne(filter))?.value !== 2
    )
      throw new Error();
    result.update = true;
    if ((await documents.deleteOne(filter)).deletedCount !== 1 || (await documents.findOne(filter)))
      throw new Error();
    result.delete = true;
  } catch {
    // Even an ambiguous insert is cleaned up by this invocation's unique marker only.
  } finally {
    if (attempted) {
      try {
        await documents.deleteOne(filter);
        result.cleanup = (await documents.findOne(filter)) === null;
      } catch {
        /* Report cleanup failure without driver messages or credentials. */
      }
    }
  }
  if (!Object.values(result).every(Boolean)) throw new MongoProbeError(result);
  return result;
}
