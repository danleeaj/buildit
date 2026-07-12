const SERVICE_CATALOG = [
  {
    id: "database",
    label: "Database",
    deployingLabel: "Deploying database…",
    description: "Stores the app's records and history.",
    signals: [
      "save", "saved", "saving", "record", "records", "history", "inventory",
      "project", "projects", "task", "tasks", "booking", "bookings", "note",
      "notes", "database", "persist", "persistent",
    ],
  },
  {
    id: "auth",
    label: "Authentication",
    deployingLabel: "Deploying authentication…",
    description: "Protects accounts and personal data.",
    signals: [
      "log in", "login", "sign in", "signin", "sign up", "signup", "account",
      "accounts", "user", "users", "profile", "profiles", "permission",
      "permissions", "role", "roles", "member", "members", "authentication",
    ],
  },
  {
    id: "storage",
    label: "File storage",
    deployingLabel: "Deploying file storage…",
    description: "Keeps uploaded files and media available.",
    signals: [
      "upload", "uploads", "attachment", "attachments", "photo", "photos",
      "image", "images", "document", "documents", "file", "files", "avatar",
      "avatars",
    ],
  },
  {
    id: "payments",
    label: "Payments",
    deployingLabel: "Deploying payments…",
    description: "Handles checkout and paid access.",
    signals: [
      "checkout", "subscription", "subscriptions", "billing", "invoice", "invoices",
      "pricing", "purchase", "purchases", "paid plan", "paid plans", "payment",
      "payments", "subscriber", "subscribers",
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    deployingLabel: "Deploying notifications…",
    description: "Sends reminders and important updates.",
    signals: [
      "email", "emails", "sms", "reminder", "reminders", "alert", "alerts",
      "push notification", "push notifications", "notify", "notification",
      "notifications",
    ],
  },
];

const FRONTEND = {
  id: "frontend",
  label: "Web app",
  deployingLabel: "Deploying web app…",
  description: "Publishes the interface people can open and use.",
};

function searchableText(input) {
  let snapshot = "";
  if (input?.snapshot && typeof input.snapshot === "object") {
    try {
      snapshot = JSON.stringify(input.snapshot);
    } catch {
      snapshot = "";
    }
  }

  return [input?.problem, input?.proposal, snapshot, input?.html]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function analyzeBackendRequirements(input = {}) {
  const text = ` ${searchableText(input)} `;
  const inferred = SERVICE_CATALOG
    .filter((service) => service.signals.some((signal) => text.includes(` ${signal} `)))
    .map(({ signals, ...service }) => service);

  return [...inferred, FRONTEND];
}
