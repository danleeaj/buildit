import { randomBytes } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw badRequest(`${label} is invalid.`);
  return value;
}

function input(value) {
  if (!value || typeof value !== "object") throw badRequest("Project data is required.");
  const title = String(value.title || "").trim();
  const html = String(value.html || "");
  if (!title || title.length > 160) throw badRequest("Project title is invalid.");
  if (!html) throw badRequest("Project HTML is required.");
  return {
    title,
    problem: String(value.problem || ""),
    html,
    config: value.config && typeof value.config === "object" ? value.config : {},
    conversation: Array.isArray(value.conversation) ? value.conversation : [],
    editNote: value.editNote ? String(value.editNote).slice(0, 500) : null,
  };
}

export function createProjectStore(sql) {
  return {
    async list(ownerId) {
      return sql`select id, title, problem, updated_at as "updatedAt" from projects where owner_id = ${ownerId} and not is_demo order by updated_at desc`;
    },
    async find(ownerId, projectId) {
      assertUuid(projectId, "Project ID");
      const rows = await sql`select id, title, problem, current_html as html, current_config as config, conversation, created_at as "createdAt", updated_at as "updatedAt" from projects where id = ${projectId} and owner_id = ${ownerId} and not is_demo limit 1`;
      return rows[0] || null;
    },
    async create(ownerId, value) {
      const data = input(value);
      const rows = await sql`
        with project as (
          insert into projects (owner_id, title, problem, current_html, current_config, conversation)
          values (${ownerId}, ${data.title}, ${data.problem}, ${data.html}, ${JSON.stringify(data.config)}::jsonb, ${JSON.stringify(data.conversation)}::jsonb)
          returning *
        ), version as (
          insert into project_versions (project_id, version_number, html, config, conversation)
          select id, 1, current_html, current_config, conversation from project returning id
        )
        select id, title, problem, current_html as html, current_config as config, conversation, created_at as "createdAt", updated_at as "updatedAt" from project
      `;
      return rows[0];
    },
    async update(ownerId, projectId, value) {
      assertUuid(projectId, "Project ID");
      const data = input(value);
      const rows = await sql`
        update projects set title = ${data.title}, problem = ${data.problem}, current_html = ${data.html},
          current_config = ${JSON.stringify(data.config)}::jsonb, conversation = ${JSON.stringify(data.conversation)}::jsonb,
          updated_at = now()
        where id = ${projectId} and owner_id = ${ownerId} and not is_demo
        returning id, title, problem, current_html as html, current_config as config, conversation, created_at as "createdAt", updated_at as "updatedAt"
      `;
      return rows[0] || null;
    },
    async createVersion(ownerId, projectId, value) {
      assertUuid(projectId, "Project ID");
      const data = input(value);
      const rows = await sql`
        with owned as (
          select id from projects where id = ${projectId} and owner_id = ${ownerId} and not is_demo
        ), next_version as (
          select coalesce(max(version_number), 0) + 1 as number from project_versions where project_id = ${projectId}
        ), version as (
          insert into project_versions (project_id, version_number, html, config, conversation, edit_note)
          select owned.id, next_version.number, ${data.html}, ${JSON.stringify(data.config)}::jsonb,
            ${JSON.stringify(data.conversation)}::jsonb, ${data.editNote}
          from owned cross join next_version returning *
        ), updated as (
          update projects set title = ${data.title}, problem = ${data.problem}, current_html = ${data.html},
            current_config = ${JSON.stringify(data.config)}::jsonb, conversation = ${JSON.stringify(data.conversation)}::jsonb,
            updated_at = now() where id in (select project_id from version) returning id
        )
        select id, project_id as "projectId", version_number as "versionNumber", created_at as "createdAt" from version
      `;
      return rows[0] || null;
    },
    async versions(ownerId, projectId) {
      assertUuid(projectId, "Project ID");
      return sql`
        select v.id, v.version_number as "versionNumber", v.edit_note as "editNote", v.created_at as "createdAt"
        from project_versions v join projects p on p.id = v.project_id
        where p.id = ${projectId} and p.owner_id = ${ownerId} and not p.is_demo order by v.version_number desc
      `;
    },
    async createShare(ownerId, projectId, versionId) {
      assertUuid(projectId, "Project ID");
      assertUuid(versionId, "Version ID");
      const token = randomBytes(32).toString("base64url");
      const rows = await sql`
        insert into share_links (project_id, project_version_id, token)
        select p.id, v.id, ${token} from projects p join project_versions v on v.project_id = p.id
        where p.id = ${projectId} and p.owner_id = ${ownerId} and not p.is_demo and v.id = ${versionId}
        returning token
      `;
      return rows[0] || null;
    },
    async revokeShare(ownerId, projectId, token) {
      assertUuid(projectId, "Project ID");
      const rows = await sql`
        update share_links s set is_enabled = false, updated_at = now()
        from projects p where s.project_id = p.id and p.id = ${projectId} and p.owner_id = ${ownerId} and s.token = ${token}
        returning s.token
      `;
      return rows[0] || null;
    },
    async getDemo() {
      const projects = await sql`select id, title, problem, current_html as html, current_config as config, conversation, created_at as "createdAt", updated_at as "updatedAt" from projects where is_demo = true limit 1`;
      if (!projects[0]) return null;
      const versions = await sql`select id, version_number as "versionNumber", html, config, conversation, edit_note as "editNote", created_at as "createdAt" from project_versions where project_id = ${projects[0].id} order by version_number desc`;
      return { ...projects[0], versions };
    },
    async getShared(token) {
      const rows = await sql`
        select p.title, p.problem, v.id as "versionId", v.html, v.config, v.conversation, v.edit_note as "editNote", v.created_at as "createdAt"
        from share_links s join projects p on p.id = s.project_id join project_versions v on v.id = s.project_version_id
        where s.token = ${token} and s.is_enabled and (s.expires_at is null or s.expires_at > now()) limit 1
      `;
      return rows[0] || null;
    },
  };
}
