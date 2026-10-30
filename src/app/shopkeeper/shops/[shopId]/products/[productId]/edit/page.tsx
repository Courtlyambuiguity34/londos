import { GuidedProductPage } from "@/components/guided-product-page";
export const metadata = { title: "Update a product" };
export default async function Page({
  params,
}: {
  params: Promise<{ shopId: string; productId: string }>;
}) {
  const value = await params;
  return <GuidedProductPage shopId={value.shopId} productId={value.productId} />;
}
