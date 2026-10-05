import { z } from "zod";
import { database } from "@/server/db/pool";
import { coreConfigured, coreConfig } from "@/server/config";
import { AccessError } from "@/server/security/errors";
import { readPublicVariant } from "@/server/public-shop";
export async function GET(
  _request: Request,
  context: { params: Promise<{ shopId: string; id: string; variant: string }> },
) {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  try {
    if (!coreConfigured() || !coreConfig().localAdapters)
      return Response.json({ error: "service_unavailable" }, { status: 503, headers });
    const { shopId, id, variant } = await context.params,
      bytes = await readPublicVariant(database(), shopId, id, variant);
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, "Content-Type": "image/webp" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AccessError
            ? error.code
            : error instanceof z.ZodError
              ? "resource_unavailable"
              : "service_unavailable",
      },
      {
        status:
          error instanceof AccessError ? error.status : error instanceof z.ZodError ? 404 : 503,
        headers,
      },
    );
  }
}
