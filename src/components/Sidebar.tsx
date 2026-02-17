import { useManifestStore } from "@/stores/manifest-store";
import type { WizardStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Package,
  FileText,
  Eye,
  Send,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";

const steps: { id: WizardStep; label: string; icon: typeof Package }[] = [
  { id: "installer", label: "Installer", icon: Package },
  { id: "metadata", label: "Metadata", icon: FileText },
  { id: "review", label: "Review", icon: Eye },
  { id: "submit", label: "Submit", icon: Send },
];

const stepOrder: WizardStep[] = ["installer", "metadata", "review", "submit"];

function getStepIndex(step: WizardStep) {
  return stepOrder.indexOf(step);
}

export function Sidebar() {
  const { currentStep, setStep, reset } = useManifestStore();
  const currentIndex = getStepIndex(currentStep);

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card/50">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">UniCreate</h1>
          <p className="text-xs text-muted-foreground">WinGet Manifest Creator</p>
        </div>
      </div>

      <div className="mx-4 mb-4 h-px bg-border" />

      {/* Steps */}
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {steps.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = index < currentIndex;
          const isDisabled = index > currentIndex;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              onClick={() => !isDisabled && setStep(step.id)}
              disabled={isDisabled}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive &&
                  "bg-primary/10 text-primary",
                isCompleted &&
                  "text-muted-foreground hover:bg-accent hover:text-foreground",
                isDisabled &&
                  "cursor-not-allowed text-muted-foreground/40",
                !isActive &&
                  !isCompleted &&
                  !isDisabled &&
                  "text-muted-foreground hover:bg-accent"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isCompleted && "bg-emerald-500/15 text-emerald-500",
                  isDisabled && "bg-muted text-muted-foreground/40",
                  !isActive && !isCompleted && !isDisabled && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Reset */}
      <div className="border-t border-border p-3">
        <button
          onClick={reset}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>
    </aside>
  );
}
