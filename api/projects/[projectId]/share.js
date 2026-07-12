import { requireUser } from "../../_lib/auth.js";
import { database } from "../../_lib/db.js";
import { body, fail, json, method, notFound } from "../../_lib/http.js";
import { createProjectStore } from "../../_lib/projects.js";

export default async function handler(req, res) {
  if (!method(req, res, ["POST", "DELETE"])) return;
  try {
    const user = await requireUser(req);
    const store = createProjectStore(database());
    const projectId = req.query.projectId;
    if (req.method === "DELETE") {
      const { token } = await body(req);
      if (!await store.revokeShare(user.id, projectId, String(token || ""))) throw notFound();
      return json(res, 200, { revoked: true });
    }
    const { versionId } = await body(req);
    const share = await store.createShare(user.id, projectId, versionId);
    if (!share) throw notFound();
    json(res, 201, { token: share.token, url: `/share/${share.token}` });
  } catch (error) {
    fail(res, error);
  }
}
