import Link from "next/link";
import { Icon } from "./icon";

export function WorkspaceGateway({ kind }: { kind: "shopkeeper" | "landlord" }) {
  const merchant = kind === "shopkeeper";
  return (
    <section className="shell page-section workspace-page">
      <div className="workspace-symbol">
        <Icon name={merchant ? "shop" : "shield"} />
      </div>
      <p className="eyebrow">{merchant ? "Your private shop workspace" : "Londos Management"}</p>
      <h1>{merchant ? "A place to run\nyour shop." : "Care for the\nwhole mall."}</h1>
      <p className="workspace-description">
        {merchant
          ? "Manage your catalogue, shop design, contacts and tenancy in one private place."
          : "Review applications, look after tenancy and keep the shared destination trustworthy."}
      </p>
      <div className="workspace-preview-note">
        <strong>This workspace is not open in the preview.</strong>
        <p>
          No merchant or operator accounts are available here. The public preview does not provide
          access to private records or management actions.
        </p>
      </div>
      <Link href={merchant ? "/rent-a-shop" : "/"} className="button">
        {merchant ? "Learn about shop space" : "Return to the mall"}
        <Icon name="arrow" />
      </Link>
    </section>
  );
}
