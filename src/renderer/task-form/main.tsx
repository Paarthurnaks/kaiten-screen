import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { TaskForm } from "./TaskForm";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TaskForm />
  </StrictMode>,
);
