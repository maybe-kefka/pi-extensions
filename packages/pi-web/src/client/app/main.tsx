import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { applyTheme } from "./apply-theme";

// R26：主题——首帧前应用（避免闪屏）；系统深浅变化由 App 统一订阅（toast 联动同源）
applyTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
