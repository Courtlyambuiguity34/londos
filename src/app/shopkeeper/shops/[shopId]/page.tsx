import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProfileForm } from "@/components/profile-form";
import { database } from "@/server/db/pool";
import { coreConfigured } from "@/server/config";
import { pageActor } from "@/server/page-actor";
import { AccessError } from "@/server/security/errors";
import { readShop } from "@/server/workspace";
export const metadata = { title: "Shop workspace" };
export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  if (!coreConfigured()) notFound();
  const actor = await pageActor("/shopkeeper"),
    parsed = z.uuid().safeParse((await params).shopId);
  if (!parsed.success) notFound();
  const shop = await readShop(database(), actor, parsed.data).catch((error) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  return (
    <section className="shell page-section account-page">
      <p className="eyebrow">Private shop profile</p>
      <h1>{shop.name}</h1>
      <p>
        Changes save to the canonical database with an audit record and durable job. They do not
        change the public fixture preview.
      </p>
      <ProfileForm shop={shop} />
      <Link className="button" href={`/shopkeeper/shops/${shop.id}/catalogue`}>
        Manage catalogue and contacts
      </Link>
      <Link className="text-button" href="/shopkeeper">
        All your shops
      </Link>
    </section>
  );
}
