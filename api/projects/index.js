import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { body, fail, json, method } from "../_lib/http.js";
import { createProjectStore } from "../_lib/projects.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  try {
    const user = await requireUser(req);
    const store = createProjectStore(database());
    if (req.method === "GET") return json(res, 200, { projects: await store.list(user.id) });
    return json(res, 201, { project: await store.create(user.id, await body(req)) });
  } catch (error) {
    fail(res, error);
  }
}
