export type PreviewNavigation =
  { kind: "saved"; revision: number } | { kind: "proposal"; id: string };

export type ShopDestination = {
  department?: string | undefined;
  product?: string | undefined;
  after?: string | undefined;
};

// Preview identity is supplied by the authorized server reader, never a public
// URL or a client-controlled return path. Every nested link keeps that identity.
export function shopViewHref(
  view: {
    shop: { id: string; slug: string };
    privatePreview: boolean;
    previewNavigation?: PreviewNavigation;
  },
  destination: ShopDestination = {},
) {
  if (!view.privatePreview) {
    const base = `/shops/${encodeURIComponent(view.shop.slug)}`;
    const path = destination.product
      ? `${base}/products/${encodeURIComponent(destination.product)}`
      : destination.department
        ? `${base}/departments/${encodeURIComponent(destination.department)}`
        : base;
    return destination.after
      ? `${path}?${new URLSearchParams({ after: destination.after })}`
      : path;
  }
  const preview = view.previewNavigation;
  if (!preview) throw new Error("Private preview navigation requires a trusted identity.");
  const query = new URLSearchParams();
  const base =
    preview.kind === "saved"
      ? `/shopkeeper/shops/${view.shop.id}/preview`
      : `/shopkeeper/shops/${view.shop.id}/design/assistant/${preview.id}/preview`;
  if (preview.kind === "saved") query.set("revision", String(preview.revision));
  if (destination.department) query.set("department", destination.department);
  if (destination.product) query.set("product", destination.product);
  if (destination.after) query.set("after", destination.after);
  return query.size ? `${base}?${query}` : base;
}
