import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CaptureOverlay } from "./CaptureOverlay";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CaptureOverlay />
  </StrictMode>,
);
