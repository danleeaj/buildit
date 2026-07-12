import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import DeploymentScreen from "./components/DeploymentScreen.jsx";
import DrawOverlay from "./components/DrawOverlay.jsx";
import {
  BackIcon,
  CloseIcon,
  DrawIcon,
  InstallIcon,
  KeyboardIcon,
  MicrophoneIcon,
  OfflineIcon,
  RetryIcon,
} from "./components/Icons.jsx";
import CompletionActions from "./components/CompletionActions.jsx";
import AccountControl from "./components/AccountControl.jsx";
import HyperspaceBackground from "./components/HyperspaceBackground.jsx";
import IntakeQuestion from "./components/IntakeQuestion.jsx";
import MarketPane from "./components/MarketPane.jsx";
import PreviewFrame from "./components/PreviewFrame.jsx";
import ProjectsPlaceholder from "./components/ProjectsPlaceholder.jsx";
import SaveStatus from "./components/SaveStatus.jsx";
import VoiceCapture from "./components/VoiceCapture.jsx";
import useProjectPersistence from "./hooks/useProjectPersistence.js";
import useSpeechRecognition from "./hooks/useSpeechRecognition.js";
import {
  isAudioTranscriptionConfigured,
  transcribeAudio,
} from "./lib/transcription.js";
import {
  applyGeneratedAppPatches,
  mintAppId,
  parseGeneratedAppResponse,
  parsePatchResponse,
  prepareGeneratedApp,
} from "./lib/generatedApp.js";
import {
  editApp,
  discover,
  generateApp,
  isApiConfigured,
  parseDiscoveryResponse,
  propose,
  repairGeneratedApp,
} from "./lib/llm.js";
import { stagePreviewDocument } from "./lib/previewBridge.js";
import { createProjectSnapshot, fingerprintProjectSnapshot } from "./lib/marketResearch.js";
import {
  createInstallController,
  getConnectivityState,
  subscribeToConnectivity,
} from "./lib/pwa.js";
import { apiRequest } from "./lib/apiClient.js";
import { authClient, useAuthSession } from "./lib/authClient.js";
import { analyzeBackendRequirements } from "./lib/backendRequirements.js";
import {
  WORKFLOW_PHASES,
  createInitialWorkflow,
  workflowReducer,
} from "./lib/workflow.js";

const LAST_APP_KEY = "superflow:last-app";
const APPROVAL_PATTERN = /\b(yes|yeah|yep|sure|okay|ok|build it|go ahead|do it)\b/i;
const REJECTION_PATTERN = /\b(no|nope|start over|different idea)\b/i;

function readLastApp() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_APP_KEY) || "null");
    return saved?.html && saved?.appId ? saved : null;
  } catch {
    return null;
  }
}

function persistLastApp(html, appId, projectSnapshot = null) {
  localStorage.setItem(
    LAST_APP_KEY,
    JSON.stringify({ html, appId, projectSnapshot, updatedAt: new Date().toISOString() }),
  );
}

function conversationHistory(activity) {
  return activity
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({ role: item.role, content: item.text }));
}

function resultHtml(result) {
  if (!result?.ok) return null;
  return typeof result.value === "string" ? result.value : result.value?.html;
}

function resultErrors(result, fallback) {
  if (Array.isArray(result?.errors) && result.errors.length) return result.errors;
  return [fallback];
}

function friendlyError(error) {
  if (!navigator.onLine) return "You are offline. Your current app still works, but creating and editing need a connection.";
  if (error?.code === "missing-api-key") return "Superflow needs an API key before it can create apps. Add it to your local .env file and reload.";
  if (error?.code === "api-error") return "The app service did not respond cleanly. Try again in a moment.";
  return error instanceof Error ? error.message : String(error || "Something went wrong. Try again.");
}

function appTitleFromHtml(html) {
  try {
    return new DOMParser().parseFromString(html, "text/html").title || "Your app";
  } catch {
    return "Your app";
  }
}

function progressContent(phase) {
  const content = {
    [WORKFLOW_PHASES.DISCOVERING]: ["Understanding what matters", "Checking whether one small decision will make the app substantially more useful."],
    [WORKFLOW_PHASES.PROPOSING]: ["Shaping the idea", "Turning your problem into one focused app."],
    [WORKFLOW_PHASES.GENERATING]: ["Building your app", "Creating the interface, behavior, and useful starting details."],
    [WORKFLOW_PHASES.VALIDATING]: ["Making sure it works", "Checking the app before it reaches your screen."],
    [WORKFLOW_PHASES.EDITING]: ["Making the change", "Updating only the part you pointed to."],
    [WORKFLOW_PHASES.VALIDATING_EDIT]: ["Checking the change", "Your working version stays safe until this one passes."],
  };
  return content[phase] || ["Working on it", "Superflow is preparing the next step."];
}

async function validateModelDocument(modelResult, appId) {
  console.group("[Superflow] validateModelDocument");
  console.info("Model response:", {
    finishReason: modelResult.finishReason,
    textLength: modelResult.text?.length,
    model: modelResult.model,
    usage: modelResult.usage,
  });

  const parsed = parseGeneratedAppResponse(modelResult.text, {
    finishReason: modelResult.finishReason,
  });
  if (!parsed.ok) {
    console.warn("Parse failed:", parsed.errors);
    console.groupEnd();
    return parsed;
  }
  console.info("Parse OK", { byteLength: parsed.value?.byteLength, warnings: parsed.warnings });

  const prepared = prepareGeneratedApp(resultHtml(parsed), { appId });
  if (!prepared.ok) {
    console.warn("Prepare/validate failed:", prepared.errors);
    console.groupEnd();
    return prepared;
  }
  console.info("Prepare OK");

  const html = resultHtml(prepared);
  const staged = await stagePreviewDocument(html, { appId, timeoutMs: 4000 });
  if (!staged.ok) {
    console.warn("Staging failed:", staged.errors);
    console.groupEnd();
    return staged;
  }
  console.info("Staging OK");
  console.groupEnd();
  return { ok: true, value: { html, appId } };
}

const DID_YOU_KNOW_TIPS = [
  "95% of new products fail. The ones that survive almost always talked to real users before writing code.",
  "A landing page that explains your product can validate demand before you build anything.",
  "The first version of Dropbox was a 3-minute video — no working product, just proof people wanted it.",
  "Charging even $1 early on tells you more about demand than 1,000 free signups.",
  "Most successful founders spent more time on distribution than on the product itself.",
  "A waitlist with 100 engaged people is worth more than an app with 10,000 passive downloads.",
  "The best MVPs solve exactly one problem extremely well, not ten problems halfway.",
  "Your product's value isn't what it does — it's the pain it removes from someone's day.",
  "Talking to 5 users will uncover 80% of your usability issues. You don't need a massive study.",
  "Products that grow by word of mouth have 2–5x better retention than paid-acquisition products.",
  "Instagram launched with 13 features, cut 11 of them before release, and shipped only photos + filters.",
  "A clear one-sentence pitch makes everything else easier — marketing, hiring, fundraising.",
  "Notion almost died twice before finding its audience. Persistence and repositioning saved it.",
  "Customers don't buy features — they buy progress toward a better version of their situation.",
  "Pre-selling (taking payment before the product exists) is the strongest signal you can get.",
  "The \"do things that don't scale\" phase isn't a shortcut — it's where you learn what to automate later.",
  "Products that ship weekly updates in their first 90 days retain 30% more early users.",
  "Your biggest competitor isn't another app — it's your user's current habit of doing nothing.",
  "A simple product with great onboarding beats a powerful product with a confusing first minute.",
  "Every feature you add makes every other feature slightly harder to find. Edit ruthlessly.",
];

function ProgressPanel({ phase }) {
  const [title, copy] = progressContent(phase);
  const showTip = phase === WORKFLOW_PHASES.GENERATING;
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * DID_YOU_KNOW_TIPS.length));

  useEffect(() => {
    if (!showTip) return;
    const id = setInterval(() => {
      setTipIndex(i => (i + 1) % DID_YOU_KNOW_TIPS.length);
    }, 8000);
    return () => clearInterval(id);
  }, [showTip]);

  const steps = [
    { key: "idea", label: "Understand the problem" },
    { key: "build", label: "Create the app" },
    { key: "check", label: "Check the result" },
  ];
  const activeIndex = phase === WORKFLOW_PHASES.DISCOVERING || phase === WORKFLOW_PHASES.PROPOSING
    ? 0
    : phase === WORKFLOW_PHASES.GENERATING || phase === WORKFLOW_PHASES.EDITING
      ? 1
      : 2;

  return (
    <section className="progress-panel" aria-live="polite">
      <h1 className="progress-title">{title}</h1>
      <p className="progress-copy">{copy}</p>
      {showTip && (
        <p className="progress-tip" key={tipIndex}>
          <strong>Did you know?</strong> {DID_YOU_KNOW_TIPS[tipIndex]}
        </p>
      )}
      <div className="progress-steps">
        {steps.map((step, index) => (
          <div className={`progress-step ${index === activeIndex ? "active" : ""}`} key={step.key}>
            <span>{step.label}</span>
            {index === activeIndex && <span className="progress-pulse" />}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App({ demoMode = false, onLeaveDemo }) {
  const [state, dispatch] = useReducer(
    workflowReducer,
    undefined,
    createInitialWorkflow,
  );
  const [draft, setDraft] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [editPrefersTyping, setEditPrefersTyping] = useState(false);
  const [connectivity, setConnectivity] = useState(getConnectivityState);
  const [installState, setInstallState] = useState({
    canInstall: false,
    isInstalled: false,
    needsManualIosInstall: false,
  });
  const [activePane, setActivePane] = useState("app");
  const [marketSnapshot, setMarketSnapshot] = useState(null);
  const [deploymentOpen, setDeploymentOpen] = useState(false);
  const [mobileCompletionOpen, setMobileCompletionOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [voiceDrawing, setVoiceDrawing] = useState(false);
  const [voiceFinishRequested, setVoiceFinishRequested] = useState(false);
  const [voiceDrawingError, setVoiceDrawingError] = useState("");
  const [demoLoadError, setDemoLoadError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const shareUrlRef = useRef("");
  const previewRef = useRef(null);
  const drawOverlayRef = useRef(null);
  const operationRef = useRef(false);
  const approvalHandledRef = useRef("");
  const runtimeErrorRef = useRef("");
  const speech = useSpeechRecognition({
    language: "en-SG",
    transcribe: isAudioTranscriptionConfigured() ? transcribeAudio : null,
  });
  const { user } = useAuthSession();
  const persistence = useProjectPersistence(demoMode ? null : user?.id);

  const history = useMemo(
    () => conversationHistory(state.activity),
    [state.activity],
  );

  const projectSnapshot = useMemo(() => {
    if (!state.html || !state.appId) return null;
    if (state.projectSnapshot?.appId === state.appId) return state.projectSnapshot;
    return createProjectSnapshot({
      appId: state.appId,
      problem: state.problem,
      proposal: state.proposal,
      html: state.html,
      previousSnapshot: state.projectSnapshot,
    });
  }, [state.appId, state.html, state.problem, state.projectSnapshot, state.proposal]);

  const backendRequirements = useMemo(() => analyzeBackendRequirements({
    problem: state.problem,
    proposal: state.proposal,
    snapshot: projectSnapshot,
    html: state.html,
  }), [projectSnapshot, state.html, state.problem, state.proposal]);

  useEffect(() => subscribeToConnectivity(setConnectivity), []);

  useEffect(() => {
    if (!demoMode) return undefined;
    let cancelled = false;
    fetch("/api/demo")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("The demo account is not ready yet.")))
      .then(({ project }) => {
        if (!cancelled) dispatch({ type: "PROJECT_LOADED", project });
      })
      .catch((error) => {
        if (!cancelled) setDemoLoadError(error instanceof Error ? error.message : "The demo account is not ready yet.");
      });
    return () => { cancelled = true; };
  }, [demoMode]);

  useEffect(() => {
    const controller = createInstallController();
    const unsubscribe = controller.subscribe(setInstallState);
    App.installController = controller;
    return () => {
      unsubscribe();
      controller.dispose();
      if (App.installController === controller) App.installController = null;
    };
  }, []);

  useEffect(() => {
    approvalHandledRef.current = "";
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== WORKFLOW_PHASES.AWAITING_APPROVAL || !speech.finalTranscript) return;
    const spoken = speech.finalTranscript.trim();
    if (!spoken || approvalHandledRef.current === spoken) return;
    approvalHandledRef.current = spoken;
    if (APPROVAL_PATTERN.test(spoken)) void approveProposal();
    if (REJECTION_PATTERN.test(spoken)) startNewApp();
  }, [speech.finalTranscript, state.phase]);

  useEffect(() => {
    if (!voiceDrawing || !voiceFinishRequested) return;
    if (speech.requesting || speech.listening || speech.processing) return;

    if (speech.error) {
      setVoiceFinishRequested(false);
      setVoiceDrawingError(speech.error.message);
      return;
    }

    const instruction = speech.finalTranscript.trim();
    if (!instruction) {
      setVoiceFinishRequested(false);
      setVoiceDrawingError("I could not hear an instruction. Tap the recording button to try again.");
      return;
    }

    setVoiceFinishRequested(false);
    void (async () => {
      try {
        const drawing = await drawOverlayRef.current?.capture();
        setVoiceDrawing(false);
        await submitEdit(instruction, drawing);
      } catch (error) {
        setVoiceDrawingError(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [speech.error, speech.finalTranscript, speech.listening, speech.processing, speech.requesting, voiceDrawing, voiceFinishRequested]);

  const reportError = (error, resumePhase) => {
    operationRef.current = false;
    dispatch({ type: "ERROR", error: friendlyError(error), resumePhase });
  };

  function projectPayload({ html, snapshot, editNote = null }) {
    return {
      title: appTitleFromHtml(html),
      problem: state.problem,
      html,
      config: snapshot || {},
      conversation: state.activity,
      editNote,
    };
  }

  async function openProject(projectId) {
    try {
      const project = await persistence.openProject(projectId);
      shareUrlRef.current = "";
      setShareNotice("");
      setProjectsOpen(false);
      dispatch({ type: "PROJECT_LOADED", project });
    } catch {
      // The controller exposes the actionable error in the Projects screen.
    }
  }

  const createShareUrl = useCallback(async () => {
    if (shareUrlRef.current) return shareUrlRef.current;
    if (!persistence.activeProjectId || demoMode) throw new Error("Sign in to create a live share URL.");

    const { versions } = await apiRequest(`/api/projects/${persistence.activeProjectId}/versions`);
    if (!versions[0]) throw new Error("No saved version is available yet.");
    const { url } = await apiRequest(`/api/projects/${persistence.activeProjectId}/share`, {
      method: "POST",
      body: { versionId: versions[0].id },
    });
    const absoluteUrl = `${window.location.origin}${url}`;
    shareUrlRef.current = absoluteUrl;
    return absoluteUrl;
  }, [demoMode, persistence.activeProjectId]);

  async function shareCurrentVersion() {
    try {
      setShareNotice(await createShareUrl());
    } catch (error) {
      setShareNotice(error instanceof Error ? error.message : "The share URL could not be created.");
    }
  }

  async function submitProblem(problem) {
    const cleanProblem = problem.trim();
    if (!cleanProblem || operationRef.current) return;
    if (!connectivity.isOnline) {
      reportError(new Error("You are offline."), WORKFLOW_PHASES.IDLE);
      return;
    }
    operationRef.current = true;
    speech.stop();
    speech.reset();
    setDraft("");
    dispatch({ type: "PROBLEM_SUBMITTED", problem: cleanProblem });
    try {
      const discovery = await discover({ history, problem: cleanProblem });
      const questions = parseDiscoveryResponse(discovery.text);
      if (questions.length) {
        dispatch({ type: "INTAKE_READY", questions });
        operationRef.current = false;
        return;
      }

      dispatch({ type: "INTAKE_SKIPPED" });
      const response = await propose(history, cleanProblem);
      dispatch({ type: "PROPOSAL_READY", proposal: response.text.trim() });
      operationRef.current = false;
    } catch (error) {
      reportError(error, WORKFLOW_PHASES.IDLE);
    }
  }

  async function submitIntakeAnswer(answer) {
    const cleanAnswer = answer.trim();
    const question = state.intakeQuestions[state.intakeIndex];
    if (!cleanAnswer || !question || operationRef.current) return;

    speech.stop();
    speech.reset();
    setDraft("");
    const intakeAnswers = [...state.intakeAnswers, {
      id: question.id,
      question: question.question,
      answer: cleanAnswer,
    }];
    const isLastQuestion = state.intakeIndex === state.intakeQuestions.length - 1;
    dispatch({ type: "INTAKE_ANSWERED", question, answer: cleanAnswer });
    if (!isLastQuestion) return;

    operationRef.current = true;
    try {
      const response = await propose(history, state.problem, intakeAnswers);
      dispatch({ type: "PROPOSAL_READY", proposal: response.text.trim() });
      operationRef.current = false;
    } catch (error) {
      reportError(error, WORKFLOW_PHASES.ANSWERING_INTAKE);
    }
  }

  async function approveProposal() {
    if (operationRef.current || state.phase !== WORKFLOW_PHASES.AWAITING_APPROVAL) return;
    if (!connectivity.isOnline) {
      reportError(new Error("You are offline."), WORKFLOW_PHASES.AWAITING_APPROVAL);
      return;
    }
    operationRef.current = true;
    speech.stop();
    speech.reset();
    dispatch({ type: "GENERATION_STARTED" });
    const startedAt = performance.now();
    const appId = mintAppId();

    try {
      console.group("[Superflow] approveProposal");
      console.info("Starting generation", { appId, problem: state.problem });

      const firstResponse = await generateApp({
        history,
        problem: state.problem,
        proposal: state.proposal,
      });
      console.info("First generation response received");
      dispatch({ type: "VALIDATION_STARTED" });
      let candidate = await validateModelDocument(firstResponse, appId);

      if (!candidate.ok) {
        console.warn("First attempt failed, trying repair", { errors: candidate.errors });
        // ponytail: repair with targeted errors and trimmed candidate context
        const repairResponse = await repairGeneratedApp({
          history,
          problem: state.problem,
          proposal: state.proposal,
          candidate: firstResponse.text,
          errors: resultErrors(candidate, "The app document was incomplete or malformed."),
        });
        console.info("Repair response received");
        candidate = await validateModelDocument(repairResponse, appId);
      }

      if (!candidate.ok) {
        console.warn("Repair failed, trying fresh generation", { errors: candidate.errors });
        // ponytail: one more fresh attempt with no broken candidate context
        const freshResponse = await generateApp({
          history,
          problem: state.problem,
          proposal: state.proposal,
        });
        console.info("Fresh generation response received");
        candidate = await validateModelDocument(freshResponse, appId);
      }

      if (!candidate.ok) {
        console.error("All attempts failed", { errors: candidate.errors });
        console.groupEnd();
        throw new Error("I could not make a dependable app from that attempt. Try the same problem once more.");
      }

      console.info("Generation succeeded");
      console.groupEnd();

      const html = candidate.value.html;
      const nextProjectSnapshot = createProjectSnapshot({
        appId,
        problem: state.problem,
        proposal: state.proposal,
        html,
      });
      persistLastApp(html, appId, nextProjectSnapshot);
      console.info("Superflow generation timing", {
        totalMs: Math.round(performance.now() - startedAt),
      });
      dispatch({
        type: "APP_READY",
        html,
        appId,
        projectSnapshot: nextProjectSnapshot,
        message: `${appTitleFromHtml(html)} is ready. Use it, draw on it, or speak another change.`,
      });
      void persistence.saveProject(projectPayload({
        html,
        snapshot: nextProjectSnapshot,
      }));
      setPreviewReady(false);
      setActivePane("app");
      setMarketSnapshot(null);
      setDeploymentOpen(false);
      setMobileCompletionOpen(true);
      operationRef.current = false;
    } catch (error) {
      reportError(error, WORKFLOW_PHASES.AWAITING_APPROVAL);
    }
  }

  const startNewApp = () => {
    operationRef.current = false;
    speech.stop();
    speech.reset();
    setDraft("");
    setPreviewReady(false);
    setActivePane("app");
    setMarketSnapshot(null);
    setDeploymentOpen(false);
    shareUrlRef.current = "";
    setShareNotice("");
    setMobileCompletionOpen(false);
    setProjectsOpen(false);
    setVoiceDrawing(false);
    setVoiceFinishRequested(false);
    setVoiceDrawingError("");
    persistence.startNewProject();
    dispatch({ type: "NEW_APP" });
  };

  const startDrawing = () => {
    speech.reset();
    setVoiceDrawing(false);
    setVoiceFinishRequested(false);
    setVoiceDrawingError("");
    dispatch({ type: "DRAWING_STARTED" });
  };

  const startVoiceDrawing = () => {
    if (operationRef.current || !connectivity.isOnline) return;
    setDraft("");
    setVoiceDrawing(true);
    setVoiceFinishRequested(false);
    setVoiceDrawingError("");
    dispatch({ type: "DRAWING_STARTED" });
    speech.start();
  };

  const cancelVoiceDrawing = () => {
    speech.reset();
    setVoiceDrawing(false);
    setVoiceFinishRequested(false);
    setVoiceDrawingError("");
    dispatch({ type: "DRAWING_CANCELLED" });
  };

  const finishVoiceDrawing = () => {
    if (voiceFinishRequested || speech.processing) return;
    setVoiceFinishRequested(true);
    setVoiceDrawingError("");
    speech.stop();
  };

  const openEditCapture = (preferTyping = false) => {
    speech.reset();
    setDraft("");
    setVoiceDrawing(false);
    setVoiceFinishRequested(false);
    setVoiceDrawingError("");
    setEditPrefersTyping(preferTyping);
    dispatch({ type: "DRAWING_CAPTURED", drawing: null });
  };

  const drawingDone = (drawing) => {
    speech.reset();
    setDraft("");
    setVoiceDrawing(false);
    setVoiceFinishRequested(false);
    setVoiceDrawingError("");
    setEditPrefersTyping(false);
    dispatch({ type: "DRAWING_CAPTURED", drawing });
  };

  async function submitEdit(instruction, drawing = state.pendingDrawing) {
    const cleanInstruction = instruction.trim();
    if (!cleanInstruction || operationRef.current || !state.html || !state.appId) return;
    if (!connectivity.isOnline) {
      reportError(new Error("You are offline."), WORKFLOW_PHASES.READY);
      return;
    }
    operationRef.current = true;
    speech.stop();
    speech.reset();
    setDraft("");
    dispatch({ type: "EDIT_STARTED" });
    const startedAt = performance.now();

    try {
      let screenshotDataUrl = drawing?.screenshotDataUrl;
      if (!screenshotDataUrl) {
        const capture = await previewRef.current.capture();
        screenshotDataUrl = capture.dataUrl;
      }

      const response = await editApp({
        html: state.html,
        screenshotDataUrl,
        component: drawing?.component || null,
        instruction: cleanInstruction,
      });
      console.group("[Superflow] submitEdit");
      console.info("Edit response:", {
        finishReason: response.finishReason,
        textLength: response.text?.length,
        model: response.model,
        usage: response.usage,
        component: drawing?.component || null,
        instruction: cleanInstruction,
      });

      const parsed = parsePatchResponse(response.text, {
        finishReason: response.finishReason,
      });
      if (!parsed.ok) {
        console.warn("Patch parse failed:", parsed.errors);
        console.groupEnd();
        throw new Error(resultErrors(parsed, "The change was incomplete.")[0]);
      }
      console.info("Patch parsed OK", { blocks: parsed.value.blocks.map(b => `${b.type}:${b.name}`) });

      const applied = applyGeneratedAppPatches(state.html, parsed.value, {
        appId: state.appId,
      });
      if (!applied.ok) {
        console.warn("Patch apply failed:", applied.errors);
        console.groupEnd();
        throw new Error(resultErrors(applied, "The change did not fit the app.")[0]);
      }
      console.info("Patch applied OK");

      dispatch({ type: "EDIT_VALIDATION_STARTED" });
      const html = resultHtml(applied);
      const staged = await stagePreviewDocument(html, { appId: state.appId, timeoutMs: 4000 });
      if (!staged.ok) {
        console.warn("Edit staging failed:", staged.errors);
        console.groupEnd();
        throw new Error(resultErrors(staged, "The changed app did not start cleanly.")[0]);
      }
      console.info("Edit staging OK");
      console.groupEnd();

      const nextProjectSnapshot = createProjectSnapshot({
        appId: state.appId,
        problem: state.problem,
        proposal: state.proposal,
        html,
        previousSnapshot: state.projectSnapshot,
        latestChange: cleanInstruction,
      });
      persistLastApp(html, state.appId, nextProjectSnapshot);
      console.info("Superflow edit timing", {
        totalMs: Math.round(performance.now() - startedAt),
      });
      dispatch({
        type: "APP_READY",
        html,
        appId: state.appId,
        projectSnapshot: nextProjectSnapshot,
        message: "Changed. Your previous version stayed in place until this one passed its checks.",
      });
      void persistence.saveProject(projectPayload({
        html,
        snapshot: nextProjectSnapshot,
        editNote: cleanInstruction,
      }));
      setPreviewReady(false);
      operationRef.current = false;
    } catch (error) {
      reportError(
        new Error("That change did not take, so I kept the working version. Try circling a smaller area or rephrasing it."),
        WORKFLOW_PHASES.READY,
      );
      console.error(error);
    }
  }

  const promptInstall = async () => {
    const controller = App.installController;
    if (controller) await controller.prompt();
  };

  const showDeployBoundary = () => {
    setDeploymentOpen(true);
    setMobileCompletionOpen(false);
  };

  const exploreOpportunities = () => {
    if (!projectSnapshot) return;
    setMarketSnapshot(projectSnapshot);
    setMobileCompletionOpen(false);
    setActivePane("market");
  };

  const returnToApp = () => {
    setActivePane("app");
  };

  const hasApp = Boolean(state.html && state.appId);
  const isDrawing = state.phase === WORKFLOW_PHASES.DRAWING;
  const isVoiceDrawing = isDrawing && voiceDrawing;
  const isCapturingEdit = state.phase === WORKFLOW_PHASES.CAPTURING_EDIT;
  const isEditing = state.phase === WORKFLOW_PHASES.EDITING
    || state.phase === WORKFLOW_PHASES.VALIDATING_EDIT;
  const showPreviewError = hasApp && state.phase === WORKFLOW_PHASES.ERROR;
  const hyperspaceWorkload = speech.requesting
    || speech.listening
    || speech.processing
    || [
      WORKFLOW_PHASES.PROPOSING,
      WORKFLOW_PHASES.DISCOVERING,
      WORKFLOW_PHASES.GENERATING,
      WORKFLOW_PHASES.VALIDATING,
      WORKFLOW_PHASES.EDITING,
      WORKFLOW_PHASES.VALIDATING_EDIT,
    ].includes(state.phase);

  if (deploymentOpen && hasApp) {
    return (
      <DeploymentScreen
        appTitle={appTitleFromHtml(state.html)}
        services={backendRequirements}
        demoMode={demoMode}
        onCreateShareUrl={createShareUrl}
        onBack={() => setDeploymentOpen(false)}
      />
    );
  }

  const railMain = (() => {
    if (state.phase === WORKFLOW_PHASES.ERROR && !hasApp) {
      return (
        <section className="error-panel">
          <p className="quiet-label">Superflow paused</p>
          <h1>That did not work yet.</h1>
          <p className="error-copy">{state.error}</p>
          <div className="error-actions">
            <button type="button" className="primary-action compact" onClick={() => dispatch({ type: "CLEAR_ERROR" })}>
              <RetryIcon size={18} /> Try again
            </button>
            <button type="button" className="text-action" onClick={startNewApp}>Start over</button>
          </div>
        </section>
      );
    }

    if (state.phase === WORKFLOW_PHASES.AWAITING_APPROVAL) {
      return (
        <section className="proposal-panel">
          <p className="quiet-label">One focused idea</p>
          <h1>Here is what I would build.</h1>
          <div className="proposal-card">
            <p className="proposal-copy">{state.proposal}</p>
            <div className="proposal-actions">
              <button type="button" className="primary-action compact" onClick={approveProposal}>
                Build it
              </button>
              <button type="button" className="text-action" onClick={startNewApp}>Different idea</button>
            </div>
          </div>
          <button
            type="button"
            className="text-action proposal-voice"
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={speech.requesting || speech.processing}
          >
            {speech.listening ? <span className="recording-dot" /> : <MicrophoneIcon size={17} />}
            {speech.requesting
              ? "Opening microphone…"
              : speech.processing
                ? "Transcribing your answer…"
                : speech.listening
                  ? "Listening for yes or no"
                  : "Answer with your voice"}
          </button>
          {speech.error && <p className="inline-error" role="alert">{speech.error.message}</p>}
        </section>
      );
    }

    if (state.phase === WORKFLOW_PHASES.ANSWERING_INTAKE) {
      const question = state.intakeQuestions[state.intakeIndex];
      if (question) {
        return (
          <IntakeQuestion
            question={question}
            index={state.intakeIndex}
            total={state.intakeQuestions.length}
            speech={speech}
            textValue={draft}
            onTextValueChange={setDraft}
            onAnswer={submitIntakeAnswer}
            disabled={!connectivity.isOnline || operationRef.current}
          />
        );
      }
    }

    if ([
      WORKFLOW_PHASES.DISCOVERING,
      WORKFLOW_PHASES.PROPOSING,
      WORKFLOW_PHASES.GENERATING,
      WORKFLOW_PHASES.VALIDATING,
    ].includes(state.phase)) {
      return <ProgressPanel phase={state.phase} />;
    }

    if (!hasApp) {
      return (
        <div className={`entry-flow ${projectsOpen ? "projects-open" : ""}`}>
          <div className="entry-voice-screen" aria-hidden={projectsOpen} inert={projectsOpen ? "" : undefined}>
            <VoiceCapture
              speech={speech}
              title="What problem would you like to solve?"
              description=""
              textValue={draft}
              onTextValueChange={setDraft}
              onSubmit={submitProblem}
              submitLabel="Shape the idea"
              disabled={!connectivity.isOnline || operationRef.current}
              landing
              onOpenProjects={() => setProjectsOpen(true)}
            />
          </div>
          <div className="entry-projects-screen" aria-hidden={!projectsOpen} inert={!projectsOpen ? "" : undefined}>
            <ProjectsPlaceholder
              onReturn={() => setProjectsOpen(false)}
              projects={persistence.projects}
              listStatus={persistence.listStatus}
              error={persistence.listError}
              onRetry={persistence.loadProjects}
              onOpenProject={openProject}
            />
          </div>
        </div>
      );
    }

    return (
      <section className="proposal-panel">
        <p className="quiet-label">Live app</p>
        <h1>Your app is ready.</h1>
        {!demoMode && (
          <SaveStatus
            status={persistence.saveStatus}
            error={persistence.saveError}
            onRetry={persistence.retrySave}
          />
        )}
        <p className="error-copy">Use it on the right, keep improving it, or see whether the idea could travel further.</p>
        <CompletionActions
          onDeploy={showDeployBoundary}
          onExplore={exploreOpportunities}
        />
        {!demoMode && persistence.activeProjectId && <button type="button" className="text-action share-action" onClick={shareCurrentVersion}>Share current version</button>}
        {shareNotice && <p className="sheet-context">{shareNotice}</p>}
        <div className="keep-improving">
          <p className="quiet-label">Keep improving</p>
          <div className="proposal-actions">
            <button type="button" className="primary-action compact" onClick={startVoiceDrawing}>
              <MicrophoneIcon size={18} /> Speak + draw
            </button>
            <button type="button" className="text-action" onClick={startDrawing}>
              <DrawIcon size={18} /> Draw on it
            </button>
          </div>
        </div>
      </section>
    );
  })();

  return (
    <main className="app-shell">
      <HyperspaceBackground workload={hyperspaceWorkload} />
      {!connectivity.isOnline && (
        <div className="offline-banner" role="status">
          <OfflineIcon size={17} /> Offline. Your current app still works.
        </div>
      )}

      <div className={`workspace ${hasApp ? "has-app" : ""} ${activePane === "market" ? "market-open" : ""}`}>
        <aside className="input-rail">
          <div className="rail-inner">
            <header className={`brand-row ${!hasApp ? "entry-brand-row" : ""}`}>
              <span className="brand-wordmark">
                {hasApp && <span className="brand-mark">S</span>}
                {hasApp ? "Superflow" : "superflow"}
              </span>
              <span className={`connection-state ${connectivity.isOnline ? "" : "offline"}`}>
                {isApiConfigured() ? (connectivity.isOnline ? "Ready" : "Offline") : "Setup needed"}
              </span>
            </header>

            {!demoMode && user && (
              <AccountControl
                user={user}
                onSignOut={() => { void authClient.signOut(); }}
              />
            )}

            {demoMode && (
              <div className="demo-mode-banner">
                <span>Demo account · changes reset when you leave</span>
                <button type="button" onClick={onLeaveDemo}>Leave demo</button>
              </div>
            )}
            {demoLoadError && <p className="inline-error" role="alert">{demoLoadError}</p>}

            <div className={`rail-content ${activePane === "market" ? "market-rail-content" : ""}`}>
              {activePane === "market" && (marketSnapshot || projectSnapshot) ? (
                <MarketPane
                  key={fingerprintProjectSnapshot(marketSnapshot || projectSnapshot)}
                  snapshot={marketSnapshot || projectSnapshot}
                  onBack={returnToApp}
                  isOnline={connectivity.isOnline}
                />
              ) : railMain}
            </div>

            {activePane !== "market" && (state.activity.length > 0 || installState.canInstall || installState.needsManualIosInstall) && (
              <section className="activity-section">
                <div className="activity-header"><h2>Activity</h2></div>
                {state.activity.length > 0 && (
                  <ul className="activity-list">
                    {state.activity.slice(-5).map((item) => (
                      <li className={`activity-item ${item.role}`} key={item.id}>{item.text}</li>
                    ))}
                  </ul>
                )}
                {installState.canInstall && (
                  <button type="button" className="text-action install-action" onClick={promptInstall}>
                    <InstallIcon size={17} /> Add Superflow to this device
                  </button>
                )}
                {installState.needsManualIosInstall && (
                  <p className="sheet-context install-action">On iPhone, choose Share, then Add to Home Screen.</p>
                )}
              </section>
            )}
          </div>
        </aside>

        {hasApp && (
          <section className="preview-area" aria-label="Live generated app">
            <div className="device-frame">
              <div className="preview-window">
                <PreviewFrame
                  ref={previewRef}
                  html={state.html}
                  appId={state.appId}
                  className="preview-iframe"
                  onReady={() => setPreviewReady(true)}
                  onRuntimeError={(message) => {
                    if (!previewReady || runtimeErrorRef.current === message) return;
                    runtimeErrorRef.current = message;
                    reportError(new Error("The app hit a runtime problem. Your saved version is still available."), WORKFLOW_PHASES.READY);
                  }}
                />
              </div>

              <div className="preview-controls">
                <button type="button" className="floating-action" onClick={startNewApp} aria-label="Build a new app">
                  <BackIcon size={16} />
                </button>
              </div>

              {state.phase === WORKFLOW_PHASES.READY && !mobileCompletionOpen && (
                <button
                  type="button"
                  className="outcome-reopen mobile-only"
                  onClick={() => setMobileCompletionOpen(true)}
                >
                  Done?
                </button>
              )}

              {(state.phase === WORKFLOW_PHASES.READY || isVoiceDrawing) && (
                <div className={`tool-dock ${isVoiceDrawing ? "is-recording" : ""}`} aria-label="App editing tools">
                  {isVoiceDrawing ? (
                    <button
                      type="button"
                      className="tool-button primary"
                      onClick={finishVoiceDrawing}
                      disabled={voiceFinishRequested || speech.processing}
                      aria-label={speech.processing ? "Finishing voice edit" : "Finish voice edit"}
                      title={speech.processing ? "Finishing voice edit" : "Finish voice edit"}
                    >
                      <MicrophoneIcon size={18} />
                      <span className="sr-only">Finish</span>
                    </button>
                  ) : (
                    <>
                      <button type="button" className="tool-button" onClick={startDrawing} aria-label="Draw on the app" title="Draw on the app">
                        <DrawIcon size={18} />
                      </button>
                      <button type="button" className="tool-button primary" onClick={startVoiceDrawing} aria-label="Speak and draw a change" title="Speak and draw">
                        <MicrophoneIcon size={18} />
                      </button>
                      <button type="button" className="tool-button" onClick={() => openEditCapture(true)} aria-label="Type a change" title="Type a change">
                        <KeyboardIcon size={18} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {state.phase === WORKFLOW_PHASES.READY && mobileCompletionOpen && (
                <div className="mobile-completion-backdrop mobile-only">
                  <section className="mobile-completion-sheet" aria-label="Choose what to do next">
                    <div className="sheet-header">
                      <div>
                        <p className="quiet-label">Happy with it?</p>
                        <h2>Choose what happens next.</h2>
                      </div>
                      <button
                        type="button"
                        className="icon-action"
                        onClick={() => setMobileCompletionOpen(false)}
                        aria-label="Keep editing"
                      >
                        <CloseIcon size={19} />
                      </button>
                    </div>
                    <CompletionActions
                      onDeploy={showDeployBoundary}
                      onExplore={exploreOpportunities}
                      compact
                    />
                    <button type="button" className="text-action keep-editing-action" onClick={() => setMobileCompletionOpen(false)}>
                      Keep editing
                    </button>
                  </section>
                </div>
              )}

              {isDrawing && (
                <DrawOverlay
                  ref={isVoiceDrawing ? drawOverlayRef : null}
                  previewRef={previewRef}
                  onDone={isVoiceDrawing ? undefined : drawingDone}
                  onCancel={isVoiceDrawing ? cancelVoiceDrawing : () => dispatch({ type: "DRAWING_CANCELLED" })}
                  onError={(message) => reportError(new Error(message), WORKFLOW_PHASES.READY)}
                  error={isVoiceDrawing ? voiceDrawingError || speech.error?.message : ""}
                  hint={isVoiceDrawing ? "Speak, then circle or underline anything you want refined. Tap the recording button again when you're done." : undefined}
                />
              )}

              {isCapturingEdit && (
                <div className="edit-sheet-backdrop">
                  <section className="edit-sheet">
                    <div className="sheet-header">
                      <p className="sheet-context">
                        {state.pendingDrawing?.component
                          ? `Changing ${state.pendingDrawing.component}`
                          : "Changing the app"}
                      </p>
                      <button type="button" className="icon-action" onClick={() => dispatch({ type: "DRAWING_CANCELLED" })} aria-label="Close change input">
                        <CloseIcon size={19} />
                      </button>
                    </div>
                    <VoiceCapture
                      key={editPrefersTyping ? "typed-edit" : "voice-edit"}
                      speech={speech}
                      title={state.pendingDrawing ? "What should change here?" : "What should change?"}
                      description={state.pendingDrawing
                        ? "The mark already tells Superflow where to look. Speak naturally about the result you want."
                        : "Describe the change. Superflow will keep the working version until the update passes."}
                      textValue={draft}
                      onTextValueChange={setDraft}
                      onSubmit={submitEdit}
                      submitLabel="Make change"
                      compact
                      initialTyping={editPrefersTyping}
                    />
                  </section>
                </div>
              )}

              {isEditing && (
                <div className="preview-processing" role="status">
                  <span>{state.phase === WORKFLOW_PHASES.EDITING ? "Making the change…" : "Checking the change…"}</span>
                </div>
              )}

              {showPreviewError && (
                <div className="edit-sheet-backdrop">
                  <section className="edit-sheet error-panel">
                    <div className="sheet-header">
                      <p className="sheet-context">Working version preserved</p>
                      <button type="button" className="icon-action" onClick={() => dispatch({ type: "CLEAR_ERROR" })} aria-label="Dismiss error">
                        <CloseIcon size={19} />
                      </button>
                    </div>
                    <h1>That change did not take.</h1>
                    <p className="error-copy">{state.error}</p>
                    <div className="error-actions">
                      <button type="button" className="primary-action compact" onClick={() => dispatch({ type: "CLEAR_ERROR" })}>
                        Keep working app
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
