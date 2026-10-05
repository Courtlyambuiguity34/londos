import { z } from "zod";
import { database } from "@/server/db/pool";
import { boundedBytes } from "@/server/http";
import { reportRequest } from "@/server/trust-http";
import { attachmentAuthority, attachReportImage } from "@/server/trust";
import { consumeBudget } from "@/server/security/budget";
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  return reportRequest(request, async () => {
    const key = z.uuid().parse((await params).key),
      capability = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    await consumeBudget(database(), `trust:attachment:${key}`, 5);
    await attachmentAuthority(database(), key, capability);
    return attachReportImage(
      database(),
      key,
      capability,
      await boundedBytes(request, 2097152),
      request.headers.get("content-type") ?? "",
    );
  });
}
