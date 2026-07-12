import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks;

function apiError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

function unauthorized(message = "Sign in is required.") {
  return apiError(message, 401, "unauthorized");
}

function configuredJwksUrl() {
  if (process.env.NEON_AUTH_JWKS_URL) return process.env.NEON_AUTH_JWKS_URL;
  const authBase = process.env.NEON_AUTH_BASE_URL || process.env.VITE_NEON_AUTH_URL;
  return authBase ? `${authBase.replace(/\/$/, "")}/jwt` : null;
}

function keySet() {
  if (jwks) return jwks;
  const url = configuredJwksUrl();
  if (!url) {
    throw apiError(
      "Project authentication is not configured.",
      503,
      "auth_configuration",
    );
  }
  jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

export async function requireUser(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw unauthorized();

  const configuredKeys = keySet();
  try {
    const { payload } = await jwtVerify(match[1], configuredKeys);
    if (typeof payload.sub !== "string" || !payload.sub) throw unauthorized();
    return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
  } catch (error) {
    if (error?.status === 401) throw error;
    throw unauthorized("Your session expired. Sign in again.");
  }
}
