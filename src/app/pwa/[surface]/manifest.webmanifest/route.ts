import { isPwaSurface, pwaManifest } from "@/modules/pwa/manifest";

export async function GET(_request: Request, context: { params: Promise<{ surface: string }> }) {
  const { surface } = await context.params;
  if (!isPwaSurface(surface)) return new Response("Unknown Londos surface.", { status: 404 });
  return Response.json(pwaManifest(surface), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/manifest+json",
    },
  });
}
