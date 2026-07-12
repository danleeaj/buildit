export default function SaveStatus({ status, error, onRetry }) {
  if (status === "idle") return null;
  if (status === "saving") {
    return <p className="save-status is-saving" role="status">Saving…</p>;
  }
  if (status === "saved") {
    return <p className="save-status is-saved" role="status">Saved</p>;
  }
  return (
    <div className="save-status is-error" role="alert">
      <span><strong>Not saved.</strong> {error || "The latest version could not reach project storage."}</span>
      <button type="button" onClick={onRetry}>Retry</button>
    </div>
  );
}
