import { z } from "zod";
import type { BrevoSettings } from "../jobs/brevo";
export async function verifyBrevo(settings: BrevoSettings, transport: typeof fetch = fetch) {
  try {
    let keyAccepted = false,
      senderVerified = false;
    for (const route of ["account", "senders"] as const) {
      const response = await transport(`https://api.brevo.com/v3/${route}`, {
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: { "api-key": settings.apiKey, Accept: "application/json" },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error();
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 262144) throw new Error();
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (route === "account") {
        z.object({ email: z.email() }).parse(value);
        keyAccepted = true;
      } else
        senderVerified = z
          .object({
            senders: z.array(z.object({ email: z.email(), active: z.boolean() })).max(1000),
          })
          .parse(value)
          .senders.some(
            (s) => s.email.toLowerCase() === settings.senderEmail.toLowerCase() && s.active,
          );
    }
    return { keyAccepted, senderVerified, deliveryTested: false };
  } catch {
    throw new Error("brevo_configuration_or_access_unavailable");
  }
}
