import { GuidedProductPage } from "@/components/guided-product-page";
export const metadata = { title: "Add a product" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ department?: string }>;
}) {
  return (
    <GuidedProductPage
      shopId={(await params).shopId}
      departmentId={(await searchParams).department}
    />
  );
}
