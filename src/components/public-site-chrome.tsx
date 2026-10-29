"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Root layouts persist across client navigation. Decide which shell to show
// from the current route, rather than the root layout's initial request header.
// This controls presentation only; workspace authorization remains server-side.
export function PublicSiteChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const workspace = ["/shopkeeper", "/landlord"].some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
  return workspace ? null : children;
}
