import { useManifestStore } from "@/stores/manifest-store";
import { Sidebar } from "@/components/Sidebar";
import { StepInstaller } from "@/pages/StepInstaller";
import { StepMetadata } from "@/pages/StepMetadata";
import { StepReview } from "@/pages/StepReview";
import { StepSubmit } from "@/pages/StepSubmit";

function App() {
  const currentStep = useManifestStore((s) => s.currentStep);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-3xl">
          {currentStep === "installer" && <StepInstaller />}
          {currentStep === "metadata" && <StepMetadata />}
          {currentStep === "review" && <StepReview />}
          {currentStep === "submit" && <StepSubmit />}
        </div>
      </main>
    </div>
  );
}

export default App;
