import { renderPilotContext } from "@/server/analytics";
import { PilotObserver } from "@/components/pilot-observer";
import type { CaptureInput } from "@/modules/analytics/contract";
import { notFound } from "next/navigation";
import { z } from "zod";
import { GuestRequestForm } from "@/components/guest-request-form";
import { coreConfigured, coreConfig } from "@/server/config";
import { database } from "@/server/db/pool";
import { publicContact } from "@/server/contacts";
import { AccessError } from "@/server/security/errors";
export const dynamic = "force-dynamic";
export const metadata = { title: "Contact a shop" };
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  if (!coreConfigured() || !coreConfig().localAdapters) notFound();
  const parsed = z.uuid().safeParse((await params).shopId);
  if (!parsed.success) notFound();
  const shop = await publicContact(database(), parsed.data).catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  const channels: NonNullable<CaptureInput["channel"]>[] = [];
  if (shop.phone) channels.push("call");
  if (shop.whatsapp) channels.push("whatsapp");
  if (shop.website) channels.push("website");
  return (
    <PilotObserver
      capture={renderPilotContext({
        page: "contact",
        shopId: shop.id,
        departmentId: null,
        productId: null,
        shops: [],
        resultCount: 0,
        globalDiscovery: false,
        channels,
      })}
    >
      <section className="shell page-section account-page">
        <p className="eyebrow">Contact this shop</p>
        <h1>{shop.name}</h1>
        <div className="account-links">
          {shop.phone && (
            <a className="button" href={`tel:${shop.phone}`} data-pilot-contact="call">
              Call shop
            </a>
          )}
          {shop.whatsapp && (
            <a
              className="button"
              href={`https://wa.me/${shop.whatsapp.slice(1)}`}
              data-pilot-contact="whatsapp"
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp shop
            </a>
          )}
          {shop.website && (
            <a
              data-pilot-contact="website"
              href={shop.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              Merchant website
            </a>
          )}
        </div>
        <p>Fulfilment: {shop.fulfilment.replaceAll("_", " ")}.</p>
        {shop.delivery_instructions && <p>{shop.delivery_instructions}</p>}
        {shop.payment_instructions && <p>{shop.payment_instructions}</p>}
        <GuestRequestForm shopId={shop.id} />
      </section>
    </PilotObserver>
  );
}
