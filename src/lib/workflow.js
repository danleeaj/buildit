export const WORKFLOW_PHASES = Object.freeze({
  IDLE: "idle",
  CAPTURING_PROBLEM: "capturing_problem",
  DISCOVERING: "discovering",
  ANSWERING_INTAKE: "answering_intake",
  PROPOSING: "proposing",
  AWAITING_APPROVAL: "awaiting_approval",
  GENERATING: "generating",
  VALIDATING: "validating",
  READY: "ready",
  DRAWING: "drawing",
  CAPTURING_EDIT: "capturing_edit",
  EDITING: "editing",
  VALIDATING_EDIT: "validating_edit",
  ERROR: "error",
});

let activitySequence = 0;

export function createActivity(role, text, kind = "message") {
  activitySequence += 1;
  return {
    id: `${Date.now()}-${activitySequence}`,
    role,
    text,
    kind,
    createdAt: Date.now(),
  };
}

export function createInitialWorkflow(restored = null) {
  const hasRestoredApp = Boolean(restored?.html && restored?.appId);
  const restoredSnapshot = restored?.projectSnapshot || null;
  return {
    phase: hasRestoredApp ? WORKFLOW_PHASES.READY : WORKFLOW_PHASES.IDLE,
    activity: hasRestoredApp
      ? [createActivity("system", "Your last app is ready.", "status")]
      : [],
    problem: restoredSnapshot?.originalProblem || "",
    proposal: restoredSnapshot?.approvedSolution || "",
    html: restored?.html || null,
    appId: restored?.appId || null,
    projectSnapshot: restoredSnapshot,
    intakeQuestions: [],
    intakeIndex: 0,
    intakeAnswers: [],
    pendingDrawing: null,
    error: null,
    resumePhase: hasRestoredApp ? WORKFLOW_PHASES.READY : WORKFLOW_PHASES.IDLE,
  };
}

export function workflowReducer(state, action) {
  switch (action.type) {
    case "SET_PHASE":
      return { ...state, phase: action.phase, error: null };

    case "ADD_ACTIVITY":
      return {
        ...state,
        activity: [...state.activity, createActivity(action.role, action.text, action.kind)],
      };

    case "PROBLEM_SUBMITTED":
      return {
        ...state,
        phase: WORKFLOW_PHASES.DISCOVERING,
        problem: action.problem,
        proposal: "",
        intakeQuestions: [],
        intakeIndex: 0,
        intakeAnswers: [],
        projectSnapshot: null,
        pendingDrawing: null,
        error: null,
        activity: [...state.activity, createActivity("user", action.problem, "problem")],
      };

    case "INTAKE_READY":
      return {
        ...state,
        phase: WORKFLOW_PHASES.ANSWERING_INTAKE,
        intakeQuestions: action.questions,
        intakeIndex: 0,
        intakeAnswers: [],
        error: null,
        activity: [...state.activity, createActivity("assistant", action.questions[0].question, "question")],
      };

    case "INTAKE_SKIPPED":
      return { ...state, phase: WORKFLOW_PHASES.PROPOSING, error: null };

    case "INTAKE_ANSWERED": {
      const intakeAnswers = [...state.intakeAnswers, {
        id: action.question.id,
        question: action.question.question,
        answer: action.answer,
      }];
      const nextIndex = state.intakeIndex + 1;
      const nextQuestion = state.intakeQuestions[nextIndex];
      return {
        ...state,
        phase: nextQuestion ? WORKFLOW_PHASES.ANSWERING_INTAKE : WORKFLOW_PHASES.PROPOSING,
        intakeIndex: nextIndex,
        intakeAnswers,
        error: null,
        activity: [
          ...state.activity,
          createActivity("user", action.answer, "intake-answer"),
          ...(nextQuestion ? [createActivity("assistant", nextQuestion.question, "question")] : []),
        ],
      };
    }

    case "PROPOSAL_READY":
      return {
        ...state,
        phase: WORKFLOW_PHASES.AWAITING_APPROVAL,
        proposal: action.proposal,
        error: null,
        activity: [...state.activity, createActivity("assistant", action.proposal, "proposal")],
      };

    case "GENERATION_STARTED":
      return {
        ...state,
        phase: WORKFLOW_PHASES.GENERATING,
        error: null,
      };

    case "VALIDATION_STARTED":
      return {
        ...state,
        phase: WORKFLOW_PHASES.VALIDATING,
        error: null,
      };

    case "APP_READY":
      return {
        ...state,
        phase: WORKFLOW_PHASES.READY,
        html: action.html,
        appId: action.appId,
        projectSnapshot: action.projectSnapshot || state.projectSnapshot,
        pendingDrawing: null,
        error: null,
        resumePhase: WORKFLOW_PHASES.READY,
        activity: action.message
          ? [...state.activity, createActivity("assistant", action.message, "status")]
          : state.activity,
      };

    case "DRAWING_STARTED":
      return { ...state, phase: WORKFLOW_PHASES.DRAWING, error: null };

    case "DRAWING_CAPTURED":
      return {
        ...state,
        phase: WORKFLOW_PHASES.CAPTURING_EDIT,
        pendingDrawing: action.drawing,
        error: null,
      };

    case "DRAWING_CANCELLED":
      return {
        ...state,
        phase: WORKFLOW_PHASES.READY,
        pendingDrawing: null,
        error: null,
      };

    case "EDIT_STARTED":
      return { ...state, phase: WORKFLOW_PHASES.EDITING, error: null };

    case "EDIT_VALIDATION_STARTED":
      return { ...state, phase: WORKFLOW_PHASES.VALIDATING_EDIT, error: null };

    case "ERROR":
      return {
        ...state,
        resumePhase: action.resumePhase || state.resumePhase || WORKFLOW_PHASES.IDLE,
        phase: WORKFLOW_PHASES.ERROR,
        error: action.error,
      };

    case "CLEAR_ERROR":
      return {
        ...state,
        phase: state.resumePhase || (state.html ? WORKFLOW_PHASES.READY : WORKFLOW_PHASES.IDLE),
        error: null,
      };

    case "NEW_APP":
      return createInitialWorkflow();

    default:
      return state;
  }
}
