import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TaskForm } from "./TaskForm";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TaskForm />
  </StrictMode>,
);
