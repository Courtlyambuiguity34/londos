import { renderPilotContext } from "@/server/analytics";
import { PilotObserver } from "@/components/pilot-observer";
import type { CaptureInput } from "@/modules/analytics/contract";
import { notFound } from "next/navigation";
import { z } from "zod";
import { GuestRequestForm } from "@/components/guest-request-form";
import { ShopBuyingDetails } from "@/components/shop-buying-details";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { publicContact } from "@/server/contacts";
import { AccessError } from "@/server/security/errors";
import Link from "next/link";
import { readComparison } from "@/server/product-comparison";
import { publicShopHref } from "@/modules/discovery/shop-continuity";
import { formatMinorMoney } from "@/modules/money";
export const dynamic = "force-dynamic";
export const metadata = { title: "Contact a shop" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  if (!coreConfigured()) notFound();
  const parsed = z.uuid().safeParse((await params).shopId);
  if (!parsed.success) notFound();
  const shop = await publicContact(database(), parsed.data).catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  const requested = (await searchParams).product;
  const productId = requested === undefined ? null : z.uuid().safeParse(requested);
  if (productId && !productId.success) notFound();
  const product = productId?.success
    ? (await readComparison(database(), [productId.data])).find(
        (p) => p.shop_id === shop.id && p.availability === "available",
      )
    : null;
  if (requested !== undefined && !product) notFound();
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
        productId: product?.id ?? null,
        shops: [],
        resultCount: 0,
        globalDiscovery: false,
        channels,
      })}
    >
      <section className="shell page-section account-page">
        <p className="eyebrow">Contact this shop</p>
        <h1>{shop.name}</h1>
        {product ? (
          <section className="enquiry-product" aria-label="Product enquiry details">
            <h2>Ask about {product.name}</h2>
            <p>
              {formatMinorMoney(product.price_minor, product.currency)} · Advertised listing price
            </p>
            <Link href={publicShopHref({ shopSlug: product.shop_slug, productSlug: product.slug })}>
              Back to this listing
            </Link>
            <p>
              Tell the shop the quantity or scope you need, any options and your preferred timing.
              The shop will confirm availability, the total and arrangements.
            </p>
          </section>
        ) : null}
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
        <ShopBuyingDetails contact={shop} />
        <GuestRequestForm
          key={product?.id ?? "general"}
          shopId={shop.id}
          productId={product?.id ?? null}
        />
      </section>
    </PilotObserver>
  );
}
