import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DemoProvider } from "./store";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DemoProvider>
      <App />
    </DemoProvider>
  </StrictMode>,
);
