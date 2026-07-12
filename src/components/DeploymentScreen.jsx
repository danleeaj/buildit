import { useEffect, useRef, useState } from "react";
import {
  BackIcon,
  DoneIcon,
  ExternalLinkIcon,
  InstallIcon,
  RetryIcon,
} from "./Icons.jsx";

const STEP_DELAY_MS = 760;

export default function DeploymentScreen({
  appTitle,
  services,
  demoMode,
  onCreateShareUrl,
  onBack,
}) {
  const [completedCount, setCompletedCount] = useState(0);
  const [shareAttempt, setShareAttempt] = useState(0);
  const [shareState, setShareState] = useState({ status: "idle", url: "", error: "" });
  const [copied, setCopied] = useState(false);
  const urlInputRef = useRef(null);
  const finished = completedCount >= services.length;

  useEffect(() => {
    if (finished) return undefined;
    const timer = window.setTimeout(() => {
      setCompletedCount((count) => count + 1);
    }, STEP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [completedCount, finished]);

  useEffect(() => {
    if (!finished || demoMode) return undefined;

    let cancelled = false;
    setShareState({ status: "loading", url: "", error: "" });
    onCreateShareUrl()
      .then((url) => {
        if (!cancelled) setShareState({ status: "ready", url, error: "" });
      })
      .catch((error) => {
        if (!cancelled) {
          setShareState({
            status: "error",
            url: "",
            error: error instanceof Error ? error.message : "The deployment URL could not be created.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [demoMode, finished, onCreateShareUrl, shareAttempt]);

  const retryShare = () => {
    setCopied(false);
    setShareAttempt((attempt) => attempt + 1);
  };

  const copyUrl = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(shareState.url);
    } catch {
      urlInputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
  };

  return (
    <main className="deployment-screen">
      <header className="deployment-topbar">
        <button type="button" className="text-action deployment-back" onClick={onBack}>
          <BackIcon size={18} /> Back to builder
        </button>
        <span className="quiet-label">superflow deploy</span>
      </header>

      <section className="deployment-content">
        <div className="deployment-disclaimer" role="note">
          <strong>Demo</strong>
          <span>This is a demo, no backend is being wired up yet</span>
        </div>

        <p className="quiet-label">Deploying {appTitle}</p>
        <h1>{finished ? "Your app is ready to share." : "Preparing what your app needs."}</h1>
        <p className="deployment-intro">Superflow inferred these services from the app you created.</p>

        <div className="deployment-service-list" aria-live="polite">
          {services.map((service, index) => {
            const status = index < completedCount
              ? "complete"
              : index === completedCount
                ? "active"
                : "pending";

            return (
              <div className={`deployment-service is-${status}`} key={service.id}>
                <span className="deployment-service-icon" aria-hidden="true">
                  {status === "complete" ? <DoneIcon size={18} /> : <InstallIcon size={18} />}
                </span>
                <span className="deployment-service-copy">
                  <strong>{status === "active" ? service.deployingLabel : service.label}</strong>
                  <small>{service.description}</small>
                </span>
                <span className="deployment-service-status">
                  {status === "complete" ? "Ready" : status === "active" ? "In progress" : "Queued"}
                </span>
              </div>
            );
          })}
        </div>

        {finished && (
          <div className="deployment-result">
            {demoMode && (
              <div className="deployment-signin-note">
                <DoneIcon size={18} />
                <p>Simulation complete. Sign in to create a live share URL for this app.</p>
              </div>
            )}

            {shareState.status === "loading" && (
              <p className="deployment-result-status" role="status">Creating your deployment URL…</p>
            )}

            {shareState.status === "error" && (
              <div className="deployment-result-error">
                <p role="alert">{shareState.error}</p>
                <button type="button" className="text-action" onClick={retryShare}>
                  <RetryIcon size={17} /> Try again
                </button>
              </div>
            )}

            {shareState.status === "ready" && (
              <>
                <label htmlFor="deployment-url">Deployment URL</label>
                <div className="deployment-url-row">
                  <input ref={urlInputRef} id="deployment-url" readOnly value={shareState.url} />
                  <button type="button" className="primary-action compact" onClick={copyUrl}>
                    {copied ? "Copied" : "Copy URL"}
                  </button>
                  <a className="text-action deployment-open-link" href={shareState.url} target="_blank" rel="noreferrer">
                    Open app <ExternalLinkIcon size={17} />
                  </a>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
