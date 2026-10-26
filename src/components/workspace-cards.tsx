import { Icon } from "@/components/icon";
import Link from "next/link";
import type { ReactNode } from "react";
import { PortalIcon } from "./portal-icon";

export function WorkspaceWelcome({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="workspace-welcome" aria-label={eyebrow}>
      <div className="workspace-welcome__copy">
        <p className="workspace-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{children}</p>
        {action ? <div className="workspace-welcome__actions">{action}</div> : null}
      </div>
      <div className="workspace-welcome__art" aria-hidden="true">
        <div className="workspace-art-window">
          <span />
          <span />
          <span />
          <div>
            <i />
            <i />
            <i />
          </div>
          <strong>
            londos<span>.</span>
          </strong>
        </div>
        <span className="workspace-art-seal">
          <svg
            width="42"
            height="42"
            viewBox="0 0 40 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <path d="M20 2v36M2 20h36M7 7l26 26M7 33 33 7" />
          </svg>
        </span>
      </div>
    </section>
  );
}

export function WorkspaceTaskLink({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="workspace-task">
      <span className="workspace-task__icon">
        <PortalIcon href={href} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
      <span className="workspace-task__arrow" aria-hidden="true">
        <Icon name="arrow" />
      </span>
    </Link>
  );
}
