import { useEffect, useState } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useToastStore } from "@/stores/toast-store";
import { StepperHeader } from "@/components/StepperHeader";
import { Home } from "@/pages/Home";
import { StepInstaller } from "@/pages/StepInstaller";
import { StepMetadata } from "@/pages/StepMetadata";
import { StepReview } from "@/pages/StepReview";
import StepSubmit from "@/pages/StepSubmit";
import { CheckCircle2, AlertCircle, Info, X, Minus, Square, Copy, X as XIcon } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logoMarkUrl from "@/assets/logo-mark.png";

const appWindow = getCurrentWindow();

function Toasts() {
  const { toasts, removeToast } = useToastStore();
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 shadow-lg animate-slide-in"
        >
          {toast.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
          {toast.type === "error" && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
          {toast.type === "info" && <Info className="h-4 w-4 text-primary shrink-0" />}
          <span className="text-[12px] text-foreground/80 flex-1">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="text-muted-foreground/30 hover:text-foreground transition-colors shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function TitleBar() {
  const currentStep = useManifestStore((s) => s.currentStep);
  const isHome = currentStep === "home";
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleToggleMaximize = async () => {
    await appWindow.toggleMaximize();
    setMaximized(await appWindow.isMaximized());
  };
  const handleClose = () => appWindow.close();

  return (
    <header
      className="flex h-10 shrink-0 items-center border-b border-border/60 select-none"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
        appWindow.startDragging();
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
        handleToggleMaximize();
      }}
    >
      {/* Left: Logo + App name */}
      <div className="flex items-center gap-2 pl-3.5 pr-4">
        <img src={logoMarkUrl} alt="UniCreate" className="h-5 w-5 object-contain" />
        <span className="text-[12px] font-semibold tracking-tight text-foreground/80">UniCreate</span>
        <span className="text-[10px] text-muted-foreground/50 font-medium">v1.0.0</span>
      </div>

      {/* Center: Stepper (when not home) */}
      <div className="flex-1 flex items-center justify-center">
        {!isHome && <StepperHeader />}
      </div>

      {/* Right: Window controls */}
      <div className="flex items-center" data-no-drag>
        <button
          onClick={handleMinimize}
          className="flex h-10 w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="flex h-10 w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        <button
          onClick={handleClose}
          className="flex h-10 w-11 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

function App() {
  const currentStep = useManifestStore((s) => s.currentStep);
  const isHome = currentStep === "home";

  // Ctrl+Enter keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        const btn = document.querySelector("[data-action='primary']") as HTMLButtonElement;
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background rounded-lg">
      <TitleBar />

      <main className="flex-1 overflow-y-auto">
        <div
          className={`mx-auto max-w-2xl px-6 animate-fade-in ${isHome ? "pt-1 pb-4" : "py-10"}`}
          key={currentStep}
        >
          {currentStep === "home" && <Home />}
          {currentStep === "installer" && <StepInstaller />}
          {currentStep === "metadata" && <StepMetadata />}
          {currentStep === "review" && <StepReview />}
          {currentStep === "submit" && <StepSubmit />}
        </div>
      </main>

      <Toasts />
    </div>
  );
}

export default App;
