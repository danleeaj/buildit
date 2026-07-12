import { getAccessToken } from "./authClient.js";

export class ApiClientError extends Error {
  constructor(message, status = 0, code = "request_failed") {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, { method = "GET", body } = {}, dependencies = {}) {
  const getToken = dependencies.getToken || getAccessToken;
  const fetchImpl = dependencies.fetchImpl || fetch;
  let token;
  try {
    token = await getToken();
  } catch {
    throw new ApiClientError("Could not check your session.", 0, "network");
  }
  let response;
  try {
    response = await fetchImpl(path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiClientError("Could not reach project storage.", 0, "network");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiClientError(
      payload.error || "Request failed.",
      response.status,
      payload.code || "request_failed",
    );
  }
  return payload;
}
