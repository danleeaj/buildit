import React from "react";
import { useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./components/AuthGate.jsx";
import "./styles.css";

function Root() {
  const [demoMode, setDemoMode] = useState(false);
  if (demoMode) return <App demoMode onLeaveDemo={() => setDemoMode(false)} />;
  return <AuthGate onTryDemo={() => setDemoMode(true)}><App /></AuthGate>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
