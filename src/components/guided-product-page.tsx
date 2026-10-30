import { notFound } from "next/navigation";
import { z } from "zod";
import { coreConfigured } from "@/server/config";
import { database } from "@/server/db/pool";
import { pageActor } from "@/server/page-actor";
import { readShop } from "@/server/workspace";
import { readGuidedProduct } from "@/server/guided-product";
import { listMedia } from "@/server/media";
import { AccessError } from "@/server/security/errors";
import { ShopWorkspaceShell } from "./shop-workspace-shell";
import { GuidedProductEditor } from "./guided-product-editor";
export async function GuidedProductPage({
  shopId,
  productId,
  departmentId,
}: {
  shopId: string;
  productId?: string;
  departmentId?: string | undefined;
}) {
  if (
    !coreConfigured() ||
    !z.uuid().safeParse(shopId).success ||
    (productId && !z.uuid().safeParse(productId).success) ||
    (departmentId && !z.uuid().safeParse(departmentId).success)
  )
    notFound();
  const actor = await pageActor("/shopkeeper");
  const [shop, data, photos] = await Promise.all([
    readShop(database(), actor, shopId),
    readGuidedProduct(database(), actor, shopId, productId),
    listMedia(database(), actor, shopId),
  ]).catch((error: unknown) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    throw error;
  });
  if (departmentId && !data.catalogue.departments.some((d) => d.id === departmentId && !d.archived))
    notFound();
  return (
    <ShopWorkspaceShell
      shop={shop}
      section="catalogue"
      title={productId ? "Update your product" : "Add a product"}
      subtitle="A photo, a few details, then review and save."
      focused
    >
      <GuidedProductEditor
        shopId={shopId}
        departments={data.catalogue.departments}
        photos={photos}
        product={data.product}
        nextPosition={data.catalogue.nextProductPosition}
        initialDepartmentId={departmentId}
      />
    </ShopWorkspaceShell>
  );
}
