import { notFound } from "next/navigation";
import { z } from "zod";
import { pageActor } from "@/server/page-actor";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { AccessError } from "@/server/security/errors";
import { assistantStatus } from "@/server/ai-design/service";
import { DesignAssistant } from "@/components/design-assistant";
import { ShopWorkspaceShell } from "@/components/shop-workspace-shell";
import { requireShop } from "@/server/security/authorization";
import Link from "next/link";
export const metadata = { title: "Private conversational design" };
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    parsed = z.uuid().safeParse((await params).shopId);
  if (!parsed.success) notFound();
  const shopId = parsed.data;
  const shop = await requireShop(database(), actor, shopId, "design").catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  const initial = await assistantStatus(database(), actor, shopId).catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    if (error instanceof AccessError && error.code === "fresh_authentication_required") return null;
    throw error;
  });
  return (
    <ShopWorkspaceShell
      shop={shop}
      section="assistant"
      title="Design assistant"
      subtitle={`Describe a change to ${shop.name}, preview the proposal and save it as a draft.`}
    >
      <section className="workspace-panel">
        {initial ? (
          <DesignAssistant shopId={shopId} initial={initial} />
        ) : (
          <>
            <p role="alert">
              For your security, sign in again or verify your authenticator before requesting design
              changes. Your saved design is unchanged.
            </p>
            <Link className="button" href="/security">
              Open account security
            </Link>
            <p>
              <Link href={`/shopkeeper/shops/${shopId}/design`}>Continue with manual design</Link>
            </p>
          </>
        )}
      </section>
    </ShopWorkspaceShell>
  );
}
