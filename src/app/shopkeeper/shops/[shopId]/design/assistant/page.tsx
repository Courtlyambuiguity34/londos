import { notFound } from "next/navigation";
import { z } from "zod";
import { pageActor } from "@/server/page-actor";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { AccessError } from "@/server/security/errors";
import { assistantStatus } from "@/server/ai-design/service";
import { DesignAssistant } from "@/components/design-assistant";
export const metadata = { title: "Private conversational design" };
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    shopId = z.uuid().parse((await params).shopId);
  const initial = await assistantStatus(database(), actor, shopId).catch((error) => {
    if (error instanceof AccessError || error instanceof z.ZodError) notFound();
    throw error;
  });
  return (
    <section className="shell page-section account-page">
      <h1>Design assistant</h1>
      <DesignAssistant shopId={shopId} initial={initial} />
    </section>
  );
}
