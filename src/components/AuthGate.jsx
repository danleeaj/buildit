import { useState } from "react";
import { authClient, isAuthConfigured, useAuthSession } from "../lib/authClient.js";
import HyperspaceBackground from "./HyperspaceBackground.jsx";

function AuthForm({ onTryDemo }) {
  const [mode, setMode] = useState("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result?.error) throw new Error(result.error.message || "That did not work. Try again.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That did not work. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function google() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: window.location.origin });
      if (result?.error) throw new Error(result.error.message || "Google sign-in did not start.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Google sign-in did not start.");
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <HyperspaceBackground />
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="quiet-label">superflow</p>
        <h1 id="auth-title">Build anywhere.</h1>
        <p className="auth-copy">Sign in to keep the apps you make and every version behind them.</p>
        <button className="auth-google" type="button" onClick={google} disabled={pending}>Continue with Google</button>
        <div className="auth-divider"><span>or continue with email</span></div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "sign-up" && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></label>}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength="8" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} /></label>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button className="primary-action" type="submit" disabled={pending}>{pending ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
        </form>
        <button className="text-action auth-toggle" type="button" onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}>{mode === "sign-up" ? "Already have an account? Sign in" : "New here? Create an account"}</button>
        <button className="auth-demo" type="button" onClick={onTryDemo}>Try demo account <span>Changes reset when you leave</span></button>
      </section>
    </main>
  );
}

function ConfiguredAuthGate({ children, onTryDemo }) {
  const { user, isPending } = useAuthSession();
  if (isPending) return <main className="auth-shell"><HyperspaceBackground /><p className="auth-loading">Checking your session…</p></main>;
  return user ? children : <AuthForm onTryDemo={onTryDemo} />;
}

export default function AuthGate({ children, onTryDemo }) {
  if (!isAuthConfigured) {
    return <main className="auth-shell"><HyperspaceBackground /><section className="auth-card"><p className="quiet-label">superflow</p><h1>Build anywhere.</h1><p className="auth-copy">Add VITE_NEON_AUTH_URL, then reload.</p><button className="auth-demo" type="button" onClick={onTryDemo}>Try demo account <span>Changes reset when you leave</span></button></section></main>;
  }
  return <ConfiguredAuthGate onTryDemo={onTryDemo}>{children}</ConfiguredAuthGate>;
}
