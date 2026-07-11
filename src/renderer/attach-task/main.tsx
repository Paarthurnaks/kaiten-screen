import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { AttachTask } from "./AttachTask";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AttachTask />
  </StrictMode>,
);
