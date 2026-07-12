import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
const ownerId = process.env.DEMO_OWNER_ID;
if (!connectionString) throw new Error("DATABASE_URL is required to seed the demo project.");
if (!ownerId) throw new Error("DEMO_OWNER_ID is required to seed the demo project.");

const html = `<!DOCTYPE html><html><head><title>Court Split</title></head><body><main data-app-root data-component="App"><h1>Court Split</h1><p>Thursday court booking · $48</p><p>Amira paid. Ben and Chao each owe $16.</p></main></body></html>`;
const config = { appId: "demo-court-split", originalProblem: "Our badminton group argues about who paid for courts." };
const conversation = [{ role: "system", text: "Demo project: Court Split", kind: "status", createdAt: Date.now() }];
const sql = neon(connectionString);

const existing = await sql`
  select id from projects where is_demo = true limit 1
`;

if (existing.length) {
  await sql`
    update projects
    set owner_id = ${ownerId}, title = ${"Court Split"}, problem = ${config.originalProblem},
      current_html = ${html}, current_config = ${JSON.stringify(config)}::jsonb,
      conversation = ${JSON.stringify(conversation)}::jsonb, updated_at = now()
    where id = ${existing[0].id}
  `;
  console.log("Updated demo project.");
} else {
  const created = await sql`
    insert into projects (owner_id, title, problem, current_html, current_config, conversation, is_demo)
    values (${ownerId}, ${"Court Split"}, ${config.originalProblem}, ${html}, ${JSON.stringify(config)}::jsonb, ${JSON.stringify(conversation)}::jsonb, true)
    returning id
  `;
  await sql`
    insert into project_versions (project_id, version_number, html, config, conversation, edit_note)
    values (${created[0].id}, 1, ${html}, ${JSON.stringify(config)}::jsonb, ${JSON.stringify(conversation)}::jsonb, ${"Seeded demo"})
  `;
  console.log("Created demo project.");
}
