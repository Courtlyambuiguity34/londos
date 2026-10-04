import { previewCapabilities } from "@/server/preview";

export async function GET() {
  return Response.json(
    { status: "preview", ...previewCapabilities() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
