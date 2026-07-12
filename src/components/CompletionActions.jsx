import { ArrowIcon, InstallIcon, SearchIcon } from "./Icons.jsx";
import "./MarketPane.css";

export default function CompletionActions({
  onDeploy,
  onExplore,
  deployNotice = "",
  compact = false,
}) {
  return (
    <section
      className={`completion-actions ${compact ? "is-compact" : ""}`}
      aria-label="What to do with this app"
    >
      <div className="completion-action-list">
        <button
          type="button"
          className="completion-action completion-action-secondary"
          onClick={onDeploy}
          disabled={!onDeploy}
        >
          <span className="completion-action-icon" aria-hidden="true">
            <InstallIcon size={19} />
          </span>
          <span className="completion-action-copy">
            <strong>Deploy</strong>
            <span>Use it for yourself</span>
          </span>
          <ArrowIcon className="completion-action-arrow" size={18} />
        </button>

        <button
          type="button"
          className="completion-action completion-action-primary"
          onClick={onExplore}
          disabled={!onExplore}
        >
          <span className="completion-action-icon" aria-hidden="true">
            <SearchIcon size={19} />
          </span>
          <span className="completion-action-copy">
            <strong>Explore opportunities</strong>
            <span>Research whether others would pay for it</span>
          </span>
          <ArrowIcon className="completion-action-arrow" size={18} />
        </button>
      </div>

      {deployNotice && (
        <p className="completion-notice" role="status">
          {deployNotice}
        </p>
      )}
    </section>
  );
}
