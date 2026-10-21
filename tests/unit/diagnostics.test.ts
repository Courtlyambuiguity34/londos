import { test, expect } from "vitest";
import { failureCategory } from "../../src/server/diagnostics";
test("operational diagnostic categories do not disclose arbitrary error data", () => {
  expect(
    failureCategory({
      code: "42P01",
      message: "postgresql://private:secret@host/db",
      detail: "private SQL",
    }),
  ).toBe("database_schema_missing");
  expect(failureCategory({ code: "53300" })).toBe("database_connection_limit");
  expect(failureCategory({ code: "EMAIL_CONFIGURATION_INVALID" })).toBe(
    "email_configuration_invalid",
  );
  expect(failureCategory({ code: "secret-value", message: "secret-value" })).toBe(
    "service_unavailable",
  );
  expect(failureCategory(new Error("private connection string"))).toBe("service_unavailable");
});
