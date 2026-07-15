import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { Annotation } from "./Annotation";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Annotation />
  </StrictMode>,
);
