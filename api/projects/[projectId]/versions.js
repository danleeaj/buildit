import { requireUser } from "../../_lib/auth.js";
import { database } from "../../_lib/db.js";
import { body, fail, json, method, notFound } from "../../_lib/http.js";
import { createProjectStore } from "../../_lib/projects.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  try {
    const user = await requireUser(req);
    const store = createProjectStore(database());
    if (req.method === "GET") return json(res, 200, { versions: await store.versions(user.id, req.query.projectId) });
    const version = await store.createVersion(user.id, req.query.projectId, await body(req));
    if (!version) throw notFound();
    json(res, 201, { version });
  } catch (error) {
    fail(res, error);
  }
}
