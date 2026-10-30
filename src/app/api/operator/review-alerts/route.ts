import { database } from "@/server/db/pool";
import { workspaceRequest, boundedBody } from "@/server/http";
import {
  readReviewAlerts,
  setReviewAlerts,
  reviewAlertInput,
} from "@/server/operator-review-alerts";
export function GET(request: Request) {
  return workspaceRequest(request, (actor) => readReviewAlerts(database(), actor));
}
export function PUT(request: Request) {
  return workspaceRequest(request, async (actor) =>
    setReviewAlerts(database(), actor, reviewAlertInput.parse(await boundedBody(request))),
  );
}
