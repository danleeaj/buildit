import { afterEach, expect, test } from "bun:test";
import { requireUser } from "./auth.js";

const originalJwks = process.env.NEON_AUTH_JWKS_URL;
const originalBase = process.env.NEON_AUTH_BASE_URL;
const originalPublicUrl = process.env.VITE_NEON_AUTH_URL;

afterEach(() => {
  if (originalJwks === undefined) delete process.env.NEON_AUTH_JWKS_URL;
  else process.env.NEON_AUTH_JWKS_URL = originalJwks;
  if (originalBase === undefined) delete process.env.NEON_AUTH_BASE_URL;
  else process.env.NEON_AUTH_BASE_URL = originalBase;
  if (originalPublicUrl === undefined) delete process.env.VITE_NEON_AUTH_URL;
  else process.env.VITE_NEON_AUTH_URL = originalPublicUrl;
});

test("missing Neon Auth URLs are a server configuration error", async () => {
  delete process.env.NEON_AUTH_JWKS_URL;
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.VITE_NEON_AUTH_URL;
  await expect(requireUser({ headers: { authorization: "Bearer token" } })).rejects.toMatchObject({
    status: 503,
    code: "auth_configuration",
  });
});

test("missing bearer credentials are unauthorized", async () => {
  await expect(requireUser({ headers: {} })).rejects.toMatchObject({
    status: 401,
    code: "unauthorized",
  });
});
