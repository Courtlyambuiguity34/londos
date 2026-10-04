import type { Metadata } from "next";
import { WorkspaceGateway } from "@/components/workspace-gateway";

export const metadata: Metadata = { title: "Londos Management" };
export default function LandlordPage() {
  return <WorkspaceGateway kind="landlord" />;
}
