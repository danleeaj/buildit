import { describe, expect, test } from "bun:test";
import {
  WORKFLOW_PHASES,
  createInitialWorkflow,
  workflowReducer,
} from "./workflow.js";

describe("workflowReducer", () => {
  test("moves a submitted problem to proposal generation", () => {
    const next = workflowReducer(createInitialWorkflow(), {
      type: "PROBLEM_SUBMITTED",
      problem: "Our badminton group forgets who paid.",
    });
    expect(next.phase).toBe(WORKFLOW_PHASES.PROPOSING);
    expect(next.problem).toContain("badminton");
    expect(next.activity).toHaveLength(1);
  });

  test("restores a previous valid app", () => {
    const state = createInitialWorkflow({ appId: "app-1", html: "<!doctype html>" });
    expect(state.phase).toBe(WORKFLOW_PHASES.READY);
    expect(state.appId).toBe("app-1");
  });

  test("an error returns to the preserved ready app", () => {
    const ready = createInitialWorkflow({ appId: "app-1", html: "valid" });
    const failed = workflowReducer(ready, { type: "ERROR", error: "No connection" });
    const recovered = workflowReducer(failed, { type: "CLEAR_ERROR" });
    expect(recovered.phase).toBe(WORKFLOW_PHASES.READY);
    expect(recovered.html).toBe("valid");
  });
});
