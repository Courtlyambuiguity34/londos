import Link from "next/link";
import { Icon } from "./icon";

export function EmptyState({
  title,
  description,
  href = "/search",
  action = "Explore the mall",
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name="shop" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link href={href} className="button button--outline">
        {action}
        <Icon name="arrow" />
      </Link>
    </div>
  );
}
