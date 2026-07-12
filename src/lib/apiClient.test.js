import { expect, test } from "bun:test";
import { ApiClientError, apiRequest } from "./apiClient.js";

test("apiRequest forwards the bearer token", async () => {
  let headers;
  await apiRequest("/api/projects", {}, {
    getToken: async () => "jwt-token",
    fetchImpl: async (_path, options) => {
      headers = options.headers;
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    },
  });
  expect(headers.Authorization).toBe("Bearer jwt-token");
});

test("apiRequest preserves an expired-session category", async () => {
  const request = apiRequest("/api/projects", {}, {
    getToken: async () => "expired",
    fetchImpl: async () => new Response(
      JSON.stringify({ error: "Your session expired. Sign in again.", code: "unauthorized" }),
      { status: 401 },
    ),
  });
  await expect(request).rejects.toMatchObject({ status: 401, code: "unauthorized" });
});

test("apiRequest categorizes a network failure", async () => {
  const request = apiRequest("/api/projects", {}, {
    getToken: async () => "jwt-token",
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
  });
  await expect(request).rejects.toMatchObject({
    message: "Could not reach project storage.",
    status: 0,
    code: "network",
  });
});

test("apiRequest categorizes a session lookup failure", async () => {
  const request = apiRequest("/api/projects", {}, {
    getToken: async () => { throw new TypeError("Failed to fetch"); },
    fetchImpl: async () => { throw new Error("must not run"); },
  });
  await expect(request).rejects.toMatchObject({
    message: "Could not check your session.",
    status: 0,
    code: "network",
  });
});

test("ApiClientError carries a stable category", () => {
  expect(new ApiClientError("Nope", 503, "auth_configuration")).toMatchObject({
    name: "ApiClientError",
    status: 503,
    code: "auth_configuration",
  });
});
