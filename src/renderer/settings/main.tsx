import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Временная заглушка окна настроек. Реальный UI — см. задачу "Renderer: раздел настроек".
function App() {
  return <div>Kaiten Screen — Settings (placeholder)</div>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
