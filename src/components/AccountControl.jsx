export default function AccountControl({ user, onSignOut }) {
  const identity = user?.name?.trim() || user?.email || "Signed in";
  return (
    <div className="account-control">
      <span className="account-identity" title={user?.email || identity}>{identity}</span>
      <button type="button" onClick={onSignOut}>Sign out</button>
    </div>
  );
}
