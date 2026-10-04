import { previewCapabilities } from "@/server/preview";
import { coreConfigured } from "@/server/config";

export async function GET() {
  return Response.json(
    {
      status: "preview",
      ...previewCapabilities(),
      coreConfigured: coreConfigured(),
      readiness: "/api/ready",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
