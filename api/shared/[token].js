import { database } from "../_lib/db.js";
import { fail, json, method, notFound } from "../_lib/http.js";
import { createProjectStore } from "../_lib/projects.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;
  try {
    const version = await createProjectStore(database()).getShared(req.query.token);
    if (!version) throw notFound();
    json(res, 200, { version }, { cache: "public, max-age=60" });
  } catch (error) {
    fail(res, error);
  }
}
