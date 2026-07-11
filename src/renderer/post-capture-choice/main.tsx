import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { PostCaptureChoice } from "./PostCaptureChoice";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostCaptureChoice />
  </StrictMode>,
);
