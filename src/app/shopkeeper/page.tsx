import type { Metadata } from "next";
import { WorkspaceGateway } from "@/components/workspace-gateway";

export const metadata: Metadata = { title: "Shopkeeper" };
export default function ShopkeeperPage() {
  return <WorkspaceGateway kind="shopkeeper" />;
}
