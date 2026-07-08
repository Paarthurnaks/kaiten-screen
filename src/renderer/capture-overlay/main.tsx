import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Временная заглушка overlay-окна. Реальный UI — см. задачу "Renderer: overlay выделения области".
function App() {
  return <div>Kaiten Screen — Capture overlay (placeholder)</div>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
