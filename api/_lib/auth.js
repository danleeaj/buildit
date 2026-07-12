import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks;

function unauthorized() {
  const error = new Error("Sign in is required.");
  error.status = 401;
  return error;
}

function keySet() {
  if (jwks) return jwks;
  const url = process.env.NEON_AUTH_JWKS_URL;
  if (!url) throw new Error("NEON_AUTH_JWKS_URL is not configured.");
  jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

export async function requireUser(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw unauthorized();

  try {
    const { payload } = await jwtVerify(match[1], keySet());
    if (typeof payload.sub !== "string" || !payload.sub) throw unauthorized();
    return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
  } catch (error) {
    if (error?.status === 401) throw error;
    throw unauthorized();
  }
}
