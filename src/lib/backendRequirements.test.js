import { describe, expect, test } from "bun:test";
import { analyzeBackendRequirements } from "./backendRequirements.js";

describe("backend requirement inference", () => {
  test("infers matching services in catalog order and appends frontend", () => {
    const services = analyzeBackendRequirements({
      problem: "Members sign in to save bookings and upload a profile photo.",
      proposal: "Send email reminders after each booking.",
      snapshot: { audience: "paid subscribers" },
      html: "<button>Checkout</button>",
    });

    expect(services.map(({ id }) => id)).toEqual([
      "database",
      "auth",
      "storage",
      "payments",
      "notifications",
      "frontend",
    ]);
  });

  test("deduplicates repeated signals", () => {
    const services = analyzeBackendRequirements({
      problem: "Login login accounts",
      proposal: "User authentication",
      html: "<form aria-label='Sign in'></form>",
    });

    expect(services.filter(({ id }) => id === "auth")).toHaveLength(1);
  });

  test("returns only frontend when no backend signal exists", () => {
    const services = analyzeBackendRequirements({
      html: "<main>Static calculator</main>",
    });

    expect(services.map(({ id }) => id)).toEqual(["frontend"]);
  });
});
