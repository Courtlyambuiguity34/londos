import "server-only";

export function assertPreviewConfiguration(): void {
  const source = process.env.LONDOS_DATA_SOURCE ?? "fixtures";
  if (source !== "fixtures") {
    throw new Error(
      "This build only supports the labeled fixture preview. Database mode is not implemented yet.",
    );
  }
}

export function previewCapabilities() {
  assertPreviewConfiguration();
  return {
    mode: "fixture-preview" as const,
    publicBrowsing: true,
    transactions: false,
    authentication: false,
    database: false,
    ai: false,
  };
}
