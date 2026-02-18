import { useEffect } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useToastStore } from "@/stores/toast-store";
import { StepperHeader } from "@/components/StepperHeader";
import { Home } from "@/pages/Home";
import { StepInstaller } from "@/pages/StepInstaller";
import { StepMetadata } from "@/pages/StepMetadata";
import { StepReview } from "@/pages/StepReview";
import { StepSubmit } from "@/pages/StepSubmit";
import { Package, CheckCircle2, AlertCircle, Info, X } from "lucide-react";

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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-600">
            <Package className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-foreground">UniCreate</span>
          <span className="text-[11px] text-muted-foreground/60 font-medium">v1.0.0</span>
        </div>
        {!isHome && <StepperHeader />}
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-10 animate-fade-in" key={currentStep}>
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