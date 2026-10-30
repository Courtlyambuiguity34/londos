import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { brevoMessage } from "../../src/server/jobs/brevo";
import { messageSchema } from "../../src/server/jobs/adapters";
import { designRequestFeedback } from "../../src/modules/design-feedback";

test("review alerts link to the authenticated queue without business details or evidence", () => {
  const input = {
    template: "application-review-queue",
    operatorId: "reviewer",
    applicationId: randomUUID(),
    to: "reviewer@example.org",
  };
  const rendered = brevoMessage(input, "https://mall.example.org");
  expect(rendered.text).toContain(
    "https://mall.example.org/landlord/applications?status=submitted",
  );
  expect(rendered.text).not.toContain(input.applicationId);
  expect(messageSchema.safeParse({ ...input, evidence: "private-photo" }).success).toBe(false);
  expect(messageSchema.safeParse({ ...input, operatorId: "" }).success).toBe(false);
  expect(designRequestFeedback(422, { error: "photo_review_required" })).toContain(
    "missing product and department photos",
  );
});
