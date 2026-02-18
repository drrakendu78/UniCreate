import { useEffect, useState } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  FileCode,
  Download,
  Loader2,
} from "lucide-react";

export function StepReview() {
  const { manifest, generatedYaml, setGeneratedYaml, setStep } = useManifestStore();
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generate = async () => {
      setLoading(true);
      setError(null);
      try {
        const files = await invoke<{ fileName: string; content: string }[]>("generate_yaml", { manifest });
        setGeneratedYaml(files);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    generate();
  }, [manifest, setGeneratedYaml]);

  const handleCopy = async () => {
    if (!generatedYaml[activeTab]) return;
    await navigator.clipboard.writeText(generatedYaml[activeTab].content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    try {
      await invoke("save_yaml_files", {
        files: generatedYaml,
        packageId: manifest.packageIdentifier,
        version: manifest.packageVersion,
      });
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary/60" />
        <span className="text-[13px] text-muted-foreground/60">Generating manifests...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-[13px] text-destructive">{error}</p>
        </div>
        <button onClick={() => setStep("metadata")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground/60 mb-2">
            <span>Step 3 of 4</span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Review Manifests</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
            Preview the YAML files that will be submitted. You can also save them locally.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Download className="h-3 w-3" />
          Save to Desktop
        </button>
      </div>

      {/* Code viewer */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center border-b border-border bg-card/30">
          <div className="flex-1 flex items-center overflow-x-auto scrollbar-none">
            {generatedYaml.map((file, index) => {
              // Show short label: extract type from filename (e.g. "locale.fr-FR" or "installer")
              const parts = file.fileName.replace(/\.yaml$/, "").split(".");
              const label = parts.length > 2 ? parts.slice(2).join(".") : parts[parts.length - 1];
              return (
                <button
                  key={file.fileName}
                  onClick={() => { setActiveTab(index); setCopied(false); }}
                  title={file.fileName}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-colors border-b-2 -mb-px whitespace-nowrap shrink-0",
                    index === activeTab
                      ? "border-primary text-foreground bg-background/50"
                      : "border-transparent text-muted-foreground/50 hover:text-muted-foreground"
                  )}
                >
                  <FileCode className="h-3 w-3 shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleCopy}
            className="mx-2 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>

        {/* Code */}
        <div className="bg-[hsl(228,14%,7%)] p-5 overflow-x-auto">
          <pre className="text-[12px] leading-[1.7] font-mono">
            <code className="text-foreground/80">{generatedYaml[activeTab]?.content}</code>
          </pre>
        </div>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => setStep("metadata")}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          onClick={() => setStep("submit")}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
