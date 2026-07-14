import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { RecordingIndicator } from "./RecordingIndicator";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RecordingIndicator />
  </StrictMode>,
);
