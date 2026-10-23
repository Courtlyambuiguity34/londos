import type { Pool } from "pg";
export type OperatorQueueCounts={applications:number|null;rentAttention:number|null;incidents:number|null;trust:number|null;privacy:number|null};
export async function operatorQueueCounts(pool:Pool,can:(permission:string)=>boolean,canAny:(...permissions:string[])=>boolean):Promise<OperatorQueueCounts>{
 async function firstCount(queries:string[]):Promise<number|null>{for(const sql of queries){try{const r=await pool.query(sql);const value=r.rows[0]?.count;if(value!=null){const n=Number(value);if(Number.isSafeInteger(n)&&n>=0)return n}}catch{/* optional queue shape unavailable */}}return null}
 const [applications,rentAttention,incidents,trust,privacy]=await Promise.all([
 can("review")?firstCount(["SELECT count(*)::int AS count FROM applications WHERE state IN ('submitted','in_review','claimed')","SELECT count(*)::int AS count FROM shop_applications WHERE state IN ('submitted','in_review','claimed')","SELECT count(*)::int AS count FROM applications WHERE state='submitted'"]):null,
 can("finance")?firstCount(["SELECT count(*)::int AS count FROM tenancies WHERE state IN ('due','grace')","SELECT count(*)::int AS count FROM tenancy WHERE state IN ('due','grace')"]):null,
 canAny("recovery","support","moderation","finance","review")?firstCount(["SELECT count(*)::int AS count FROM incidents WHERE state IN ('open','assigned','investigating')","SELECT count(*)::int AS count FROM incidents WHERE state IN ('open','assigned')"]):null,
 can("moderation")?firstCount(["SELECT count(*)::int AS count FROM shop_reports WHERE state IN ('open','assigned','under_review')","SELECT count(*)::int AS count FROM reports WHERE state IN ('open','assigned','under_review')","SELECT count(*)::int AS count FROM guest_reports WHERE state IN ('open','assigned')"]):null,
 can("privacy")?firstCount(["SELECT count(*)::int AS count FROM privacy_requests WHERE state IN ('open','assigned','in_progress')","SELECT count(*)::int AS count FROM privacy_cases WHERE state IN ('open','assigned','in_progress')"]):null]);
 return {applications,rentAttention,incidents,trust,privacy};
}