import type { CSSProperties } from "react";

export function PortalIcon({ href, style }: { href: string; style?: CSSProperties }) {
  const path = /catalogue|products/.test(href)
    ? "M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10"
    : /design|assistant/.test(href)
      ? "m4 20 4-1L20 7l-3-3L5 16l-1 4ZM14 7l3 3M4 4h6M4 8h3"
      : /rent|invoice|cost/.test(href)
        ? "M3 6h18v14H3V6Zm0 4h18M16 15h2M6 3v3"
        : /team|invitations/.test(href)
          ? "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4"
          : /security|trust|privacy|incidents/.test(href)
            ? "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6"
            : /applications/.test(href)
              ? "M7 3h10l4 4v14H3V3h4Zm9 0v5h5M7 12h10M7 16h6"
              : /communications/.test(href)
                ? "M3 5h18v14H3V5Zm0 1 9 7 9-7"
                : /services|address/.test(href)
                  ? "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"
                  : /operations|\/shops\//.test(href)
                    ? "M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7"
                    : "m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z";
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={path} />
    </svg>
  );
}
