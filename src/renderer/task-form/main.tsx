import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Временная заглушка формы задачи. Реальный UI — см. задачу "Renderer: форма создания задачи".
function App() {
  return <div>Kaiten Screen — Task form (placeholder)</div>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
