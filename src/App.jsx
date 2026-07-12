import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import DrawOverlay from "./components/DrawOverlay.jsx";
import {
  BackIcon,
  CloseIcon,
  DoneIcon,
  DrawIcon,
  InstallIcon,
  KeyboardIcon,
  MicrophoneIcon,
  OfflineIcon,
  RetryIcon,
} from "./components/Icons.jsx";
import CompletionActions from "./components/CompletionActions.jsx";
import MarketPane from "./components/MarketPane.jsx";
import PreviewFrame from "./components/PreviewFrame.jsx";
import VoiceCapture from "./components/VoiceCapture.jsx";
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
  generateApp,
  isApiConfigured,
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
    [WORKFLOW_PHASES.PROPOSING]: ["Shaping the idea", "Turning your problem into one focused app."],
    [WORKFLOW_PHASES.GENERATING]: ["Building your app", "Creating the interface, behavior, and useful starting details."],
    [WORKFLOW_PHASES.VALIDATING]: ["Making sure it works", "Checking the app before it reaches your screen."],
    [WORKFLOW_PHASES.EDITING]: ["Making the change", "Updating only the part you pointed to."],
    [WORKFLOW_PHASES.VALIDATING_EDIT]: ["Checking the change", "Your working version stays safe until this one passes."],
  };
  return content[phase] || ["Working on it", "Superflow is preparing the next step."];
}

async function validateModelDocument(modelResult, appId) {
  const parsed = parseGeneratedAppResponse(modelResult.text, {
    finishReason: modelResult.finishReason,
  });
  if (!parsed.ok) return parsed;

  const prepared = prepareGeneratedApp(resultHtml(parsed), { appId });
  if (!prepared.ok) return prepared;

  const html = resultHtml(prepared);
  const staged = await stagePreviewDocument(html, { appId, timeoutMs: 2200 });
  if (!staged.ok) return staged;
  return { ok: true, value: { html, appId } };
}

function ProgressPanel({ phase }) {
  const [title, copy] = progressContent(phase);
  const steps = [
    { key: "idea", label: "Understand the problem" },
    { key: "build", label: "Create the app" },
    { key: "check", label: "Check the result" },
  ];
  const activeIndex = phase === WORKFLOW_PHASES.PROPOSING
    ? 0
    : phase === WORKFLOW_PHASES.GENERATING || phase === WORKFLOW_PHASES.EDITING
      ? 1
      : 2;

  return (
    <section className="progress-panel" aria-live="polite">
      <h1 className="progress-title">{title}</h1>
      <p className="progress-copy">{copy}</p>
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

export default function App() {
  const [state, dispatch] = useReducer(
    workflowReducer,
    undefined,
    () => createInitialWorkflow(readLastApp()),
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
  const [deployNotice, setDeployNotice] = useState("");
  const [mobileCompletionOpen, setMobileCompletionOpen] = useState(false);
  const previewRef = useRef(null);
  const operationRef = useRef(false);
  const approvalHandledRef = useRef("");
  const runtimeErrorRef = useRef("");
  const speech = useSpeechRecognition({
    language: "en-SG",
    transcribe: isAudioTranscriptionConfigured() ? transcribeAudio : null,
  });

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

  useEffect(() => subscribeToConnectivity(setConnectivity), []);

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

  const reportError = (error, resumePhase) => {
    operationRef.current = false;
    dispatch({ type: "ERROR", error: friendlyError(error), resumePhase });
  };

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
      const response = await propose(history, cleanProblem);
      dispatch({ type: "PROPOSAL_READY", proposal: response.text.trim() });
      operationRef.current = false;
    } catch (error) {
      reportError(error, WORKFLOW_PHASES.IDLE);
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
      const firstResponse = await generateApp({
        history,
        problem: state.problem,
        proposal: state.proposal,
      });
      dispatch({ type: "VALIDATION_STARTED" });
      let candidate = await validateModelDocument(firstResponse, appId);

      if (!candidate.ok) {
        const repairResponse = await repairGeneratedApp({
          history,
          problem: state.problem,
          proposal: state.proposal,
          candidate: firstResponse.text.slice(0, 40000),
          errors: resultErrors(candidate, "The app document was incomplete."),
        });
        candidate = await validateModelDocument(repairResponse, appId);
      }

      if (!candidate.ok) {
        throw new Error("I could not make a dependable app from that attempt. Try the same problem once more.");
      }

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
      setPreviewReady(false);
      setActivePane("app");
      setMarketSnapshot(null);
      setDeployNotice("");
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
    setDeployNotice("");
    setMobileCompletionOpen(false);
    dispatch({ type: "NEW_APP" });
  };

  const startDrawing = () => {
    speech.reset();
    dispatch({ type: "DRAWING_STARTED" });
  };

  const openEditCapture = (preferTyping = false) => {
    speech.reset();
    setDraft("");
    setEditPrefersTyping(preferTyping);
    dispatch({ type: "DRAWING_CAPTURED", drawing: null });
  };

  const drawingDone = (drawing) => {
    speech.reset();
    setDraft("");
    setEditPrefersTyping(false);
    dispatch({ type: "DRAWING_CAPTURED", drawing });
  };

  async function submitEdit(instruction) {
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
      let screenshotDataUrl = state.pendingDrawing?.screenshotDataUrl;
      if (!screenshotDataUrl) {
        const capture = await previewRef.current.capture();
        screenshotDataUrl = capture.dataUrl;
      }

      const response = await editApp({
        html: state.html,
        screenshotDataUrl,
        component: state.pendingDrawing?.component || null,
        instruction: cleanInstruction,
      });
      const parsed = parsePatchResponse(response.text, {
        finishReason: response.finishReason,
      });
      if (!parsed.ok) throw new Error(resultErrors(parsed, "The change was incomplete.")[0]);

      const applied = applyGeneratedAppPatches(state.html, parsed.value, {
        appId: state.appId,
      });
      if (!applied.ok) throw new Error(resultErrors(applied, "The change did not fit the app.")[0]);

      dispatch({ type: "EDIT_VALIDATION_STARTED" });
      const html = resultHtml(applied);
      const staged = await stagePreviewDocument(html, { appId: state.appId, timeoutMs: 2200 });
      if (!staged.ok) throw new Error(resultErrors(staged, "The changed app did not start cleanly.")[0]);

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
    setDeployNotice("Personal deployment is not enabled in this demo yet. Your working app remains saved in Superflow.");
  };

  const exploreOpportunities = () => {
    if (!projectSnapshot) return;
    setMarketSnapshot(projectSnapshot);
    setDeployNotice("");
    setMobileCompletionOpen(false);
    setActivePane("market");
  };

  const returnToApp = () => {
    setActivePane("app");
  };

  const hasApp = Boolean(state.html && state.appId);
  const isDrawing = state.phase === WORKFLOW_PHASES.DRAWING;
  const isCapturingEdit = state.phase === WORKFLOW_PHASES.CAPTURING_EDIT;
  const isEditing = state.phase === WORKFLOW_PHASES.EDITING
    || state.phase === WORKFLOW_PHASES.VALIDATING_EDIT;
  const showPreviewError = hasApp && state.phase === WORKFLOW_PHASES.ERROR;

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

    if ([
      WORKFLOW_PHASES.PROPOSING,
      WORKFLOW_PHASES.GENERATING,
      WORKFLOW_PHASES.VALIDATING,
    ].includes(state.phase)) {
      return <ProgressPanel phase={state.phase} />;
    }

    if (!hasApp) {
      return (
        <VoiceCapture
          speech={speech}
          title="What should work better?"
          description="Explain the problem naturally. Names, places, and useful details will become part of the app."
          textValue={draft}
          onTextValueChange={setDraft}
          onSubmit={submitProblem}
          submitLabel="Shape the idea"
          disabled={!connectivity.isOnline || operationRef.current}
        />
      );
    }

    return (
      <section className="proposal-panel">
        <p className="quiet-label">Live app</p>
        <h1>Your app is ready.</h1>
        <p className="error-copy">Use it on the right, keep improving it, or see whether the idea could travel further.</p>
        <CompletionActions
          onDeploy={showDeployBoundary}
          onExplore={exploreOpportunities}
          deployNotice={deployNotice}
        />
        <div className="keep-improving">
          <p className="quiet-label">Keep improving</p>
          <div className="proposal-actions">
            <button type="button" className="primary-action compact" onClick={() => openEditCapture(false)}>
              <MicrophoneIcon size={18} /> Speak a change
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
      {!connectivity.isOnline && (
        <div className="offline-banner" role="status">
          <OfflineIcon size={17} /> Offline. Your current app still works.
        </div>
      )}

      <div className={`workspace ${hasApp ? "has-app" : ""} ${activePane === "market" ? "market-open" : ""}`}>
        <aside className="input-rail">
          <div className="rail-inner">
            <header className="brand-row">
              <span className="brand-wordmark"><span className="brand-mark">S</span>Superflow</span>
              <span className={`connection-state ${connectivity.isOnline ? "" : "offline"}`}>
                {isApiConfigured() ? (connectivity.isOnline ? "Ready" : "Offline") : "Setup needed"}
              </span>
            </header>

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
                  <BackIcon size={20} />
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

              {state.phase === WORKFLOW_PHASES.READY && (
                <div className="tool-dock" aria-label="App editing tools">
                  <button type="button" className="tool-button" onClick={startDrawing}>
                    <DrawIcon size={19} /><span>Draw</span>
                  </button>
                  <button type="button" className="tool-button primary" onClick={() => openEditCapture(false)}>
                    <MicrophoneIcon size={20} /><span>Speak</span>
                  </button>
                  <button type="button" className="tool-button desktop-only" onClick={() => openEditCapture(true)}>
                    <KeyboardIcon size={19} /><span>Type</span>
                  </button>
                  <button type="button" className="tool-button mobile-only" onClick={() => setMobileCompletionOpen(true)}>
                    <DoneIcon size={19} /><span>Done</span>
                  </button>
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
                      deployNotice={deployNotice}
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
                  previewRef={previewRef}
                  onDone={drawingDone}
                  onCancel={() => dispatch({ type: "DRAWING_CANCELLED" })}
                  onError={(message) => reportError(new Error(message), WORKFLOW_PHASES.READY)}
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
