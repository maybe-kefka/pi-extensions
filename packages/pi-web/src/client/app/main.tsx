import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { Toaster } from "@/shared/ui/sonner";
import { applyTheme, watchSystemScheme } from "./apply-theme";

// R26：主题——首帧前应用（避免闪屏），跟随系统模式下系统深浅变化实时刷新
applyTheme();
watchSystemScheme(() => applyTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Toaster position="top-right" />
    </TooltipProvider>
  </StrictMode>,
);
