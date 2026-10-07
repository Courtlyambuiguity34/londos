import { z } from "zod";
import { brevoSettings } from "../src/server/jobs/brevo";
import { loadLocalEnv } from "./local-env";
loadLocalEnv();
try {
  const config = brevoSettings();
  let keyAccepted = false,
    senderVerified = false;
  for (const route of ["account", "senders"] as const) {
    const response = await fetch(`https://api.brevo.com/v3/${route}`, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { "api-key": config.apiKey, Accept: "application/json" },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("provider_unavailable");
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 262144) throw new Error("provider_response_oversized");
    const value = JSON.parse(Buffer.from(bytes).toString("utf8"));
    if (route === "account") {
      z.object({ email: z.email() }).parse(value);
      keyAccepted = true;
    } else
      senderVerified = z
        .object({ senders: z.array(z.object({ email: z.email(), active: z.boolean() })).max(1000) })
        .parse(value)
        .senders.some(
          (s) => s.email.toLowerCase() === config.senderEmail.toLowerCase() && s.active,
        );
  }
  console.log(
    JSON.stringify({
      event: "email.contract",
      provider: "brevo",
      checkedAt: new Date().toISOString(),
      keyAccepted,
      senderVerified,
      deliveryTested: false,
      limitation:
        "Read-only account/sender checks; no email sent, no inbox or deliverability claim.",
    }),
  );
  if (!senderVerified) process.exitCode = 2;
} catch {
  console.error(
    '{"event":"email.contract","provider":"brevo","code":"configuration_or_access_unavailable","deliveryTested":false}',
  );
  process.exitCode = 1;
}
