import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { body, fail, json, method, notFound } from "../_lib/http.js";
import { createProjectStore } from "../_lib/projects.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "PATCH"])) return;
  try {
    const user = await requireUser(req);
    const store = createProjectStore(database());
    const project = req.method === "GET"
      ? await store.find(user.id, req.query.projectId)
      : await store.update(user.id, req.query.projectId, await body(req));
    if (!project) throw notFound();
    json(res, 200, { project });
  } catch (error) {
    fail(res, error);
  }
}
