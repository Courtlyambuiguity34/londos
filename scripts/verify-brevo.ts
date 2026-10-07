import { brevoSettings } from "../src/server/jobs/brevo";
import { verifyBrevo } from "../src/server/services/brevo-probe";
import { loadLocalEnv } from "./local-env";
loadLocalEnv();
try {
  const result = await verifyBrevo(brevoSettings());
  console.log(
    JSON.stringify({
      event: "email.contract",
      provider: "brevo",
      checkedAt: new Date().toISOString(),
      ...result,
      limitation:
        "Read-only account/sender checks; no email sent, no inbox or deliverability claim.",
    }),
  );
  if (!result.senderVerified) process.exitCode = 2;
} catch {
  console.error(
    '{"event":"email.contract","provider":"brevo","code":"configuration_or_access_unavailable","deliveryTested":false}',
  );
  process.exitCode = 1;
}
