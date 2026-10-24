import type { Instrumentation } from "next";

/**
 * Server-side request failures are emitted as structured logs for Render.
 * Do not log request bodies, query parameters, headers, cookies or stack traces:
 * they may contain personal data or secrets.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const digest = "digest" in error && typeof error.digest === "string"
    ? error.digest
    : undefined;
  console.error(JSON.stringify({
    event: "londos.request.failed",
    timestamp: new Date().toISOString(),
    route: context.routePath,
    routerKind: context.routerKind,
    routeType: context.routeType,
    renderSource: context.renderSource,
    method: request.method,
    errorType: error.name,
    ...(digest ? { digest } : {}),
  }));
};
