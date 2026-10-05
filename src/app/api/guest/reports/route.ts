import { database } from "@/server/db/pool";
import { boundedBody } from "@/server/http";
import { reportRequest } from "@/server/trust-http";
import { reportInput, submitReport } from "@/server/trust";
import { consumeBudget } from "@/server/security/budget";
export async function POST(request: Request) {
  return reportRequest(request, async () => {
    const v = reportInput.parse(await boundedBody(request));
    await consumeBudget(database(), `trust:shop:${v.shopId}`, 10);
    return submitReport(database(), v);
  });
}
