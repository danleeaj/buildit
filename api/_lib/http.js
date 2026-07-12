export function json(res, status, body, { cache = "no-store" } = {}) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.status(status).send(JSON.stringify(body));
}

export function method(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader("Allow", allowed.join(", "));
  json(res, 405, { error: "Method not allowed." });
  return false;
}

export async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (!req.body) return {};
  try {
    return JSON.parse(req.body);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

export function fail(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const message = status >= 500 ? "Something went wrong. Please try again." : error.message;
  json(res, status, { error: message });
}

export function notFound() {
  const error = new Error("Not found.");
  error.status = 404;
  return error;
}
