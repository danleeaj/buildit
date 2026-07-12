import { database } from "./_lib/db.js";
import { fail, json, method, notFound } from "./_lib/http.js";
import { createProjectStore } from "./_lib/projects.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;
  try {
    const demo = await createProjectStore(database()).getDemo();
    if (!demo) throw notFound();
    json(res, 200, { project: demo }, { cache: "public, max-age=60" });
  } catch (error) {
    fail(res, error);
  }
}
