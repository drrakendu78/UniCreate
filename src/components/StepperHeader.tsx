import { useManifestStore } from "@/stores/manifest-store";
import type { WizardStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const steps: { id: WizardStep; label: string; num: number }[] = [
  { id: "installer", label: "Installer", num: 1 },
  { id: "metadata", label: "Metadata", num: 2 },
  { id: "review", label: "Review", num: 3 },
  { id: "submit", label: "Submit", num: 4 },
];

const stepOrder: WizardStep[] = ["installer", "metadata", "review", "submit"];

export function StepperHeader() {
  const { currentStep, setStep } = useManifestStore();
  const currentIndex = stepOrder.indexOf(currentStep);

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = index < currentIndex;
        const isClickable = index <= currentIndex;

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => isClickable && setStep(step.id)}
              disabled={!isClickable}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-200",
                isActive && "bg-primary/10 text-primary",
                isCompleted && "text-muted-foreground hover:text-foreground cursor-pointer",
                !isActive && !isCompleted && "text-muted-foreground/35 cursor-default"
              )}
            >
              <div
                className={cn(
                  "flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold transition-all",
                  isActive && "bg-primary text-white",
                  isCompleted && "bg-emerald-500/15 text-emerald-500",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground/40"
                )}
              >
                {isCompleted ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : step.num}
              </div>
              <span className="hidden sm:inline">{step.label}</span>
            </button>

            {index < steps.length - 1 && (
              <div
                className={cn(
                  "mx-0.5 h-px w-5 transition-colors",
                  index < currentIndex ? "bg-emerald-500/30" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
