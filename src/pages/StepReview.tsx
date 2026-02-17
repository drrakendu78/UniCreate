import { useEffect, useState } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  FileCode2,
  Download,
  Loader2,
} from "lucide-react";

export function StepReview() {
  const { manifest, generatedYaml, setGeneratedYaml, setStep } =
    useManifestStore();
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generate = async () => {
      setLoading(true);
      setError(null);
      try {
        const files = await invoke<{ file_name: string; content: string }[]>(
          "generate_yaml",
          { manifest }
        );
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

  const handleDownloadAll = async () => {
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
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">
          Generating YAML files...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <p className="text-sm text-destructive">{error}</p>
        </div>
        <button
          onClick={() => setStep("metadata")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Metadata
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Preview the generated YAML manifests before submitting.
          </p>
        </div>
        <button
          onClick={handleDownloadAll}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Save Files
        </button>
      </div>

      {/* File tabs */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex border-b border-border">
          {generatedYaml.map((file, index) => (
            <button
              key={file.fileName}
              onClick={() => setActiveTab(index)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                index === activeTab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              {file.fileName}
            </button>
          ))}
        </div>

        {/* Code preview */}
        <div className="relative">
          <button
            onClick={handleCopy}
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
          <pre className="overflow-x-auto p-6 text-sm leading-relaxed">
            <code className="text-foreground/90">
              {generatedYaml[activeTab]?.content}
            </code>
          </pre>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep("metadata")}
          className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={() => setStep("submit")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
