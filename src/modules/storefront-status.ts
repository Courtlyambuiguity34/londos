export type StorefrontState = {
  publication: string;
  tenancy: string;
  moderation: string;
  paused: boolean;
  published_design: boolean;
};
export type StorefrontStatus = {
  public: boolean;
  label: string;
  detail: string;
  next: "design" | "rent" | "support" | null;
};
export function storefrontStatus(state: StorefrontState): StorefrontStatus {
  if (state.moderation !== "clear" || state.paused)
    return {
      public: false,
      label: "Under review",
      detail: "Your shop has a management restriction. Contact mall management before sharing it.",
      next: "support",
    };
  if (!["active", "due", "grace"].includes(state.tenancy))
    return {
      public: false,
      label: "Rent needs attention",
      detail:
        "Your storefront is unavailable while its tenancy is inactive. Check your rent status.",
      next: "rent",
    };
  if (["archived", "provisioning", "temporarily_closed"].includes(state.publication))
    return {
      public: false,
      label: "Storefront unavailable",
      detail: "Your shop is closed or still being prepared. Contact mall management for help.",
      next: "support",
    };
  if (state.publication !== "active" || !state.published_design)
    return {
      public: false,
      label: "Not published yet",
      detail:
        "Your shop space is ready, but customers cannot see it yet. Save a design, preview it, then publish your storefront.",
      next: "design",
    };
  return {
    public: true,
    label: "Live on the mall",
    detail: "Customers can open your storefront. Share its link when you are ready.",
    next: null,
  };
}
