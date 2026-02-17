import { useState } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  Key,
  Send,
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Github,
} from "lucide-react";

export function StepSubmit() {
  const { manifest, generatedYaml, setStep, isSubmitting, setIsSubmitting } =
    useManifestStore();
  const [token, setToken] = useState("");
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [githubUser, setGithubUser] = useState<string | null>(null);

  const handleVerifyToken = async () => {
    if (!token.trim()) return;
    try {
      const user = await invoke<{ login: string; avatar_url: string }>(
        "authenticate_github",
        { token: token.trim() }
      );
      setGithubUser(user.login);
      setError(null);
    } catch (e) {
      setError(String(e));
      setGithubUser(null);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const url = await invoke<string>("submit_manifest", {
        token: token.trim(),
        yamlFiles: generatedYaml,
        packageId: manifest.packageIdentifier,
        version: manifest.packageVersion,
      });
      setPrUrl(url);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (prUrl) {
    return (
      <div className="flex flex-col items-center justify-center space-y-6 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Pull Request Created!
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your manifest has been submitted to microsoft/winget-pkgs.
          </p>
        </div>
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ExternalLink className="h-4 w-4" />
          View Pull Request
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Submit</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit your manifest as a pull request to the winget-pkgs repository.
        </p>
      </div>

      {/* GitHub Token */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <Github className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">GitHub Authentication</h3>
            <p className="text-xs text-muted-foreground">
              A Personal Access Token with <code className="rounded bg-secondary px-1">public_repo</code> scope is required.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Personal Access Token</label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setGithubUser(null);
              }}
              placeholder="ghp_xxxxxxxxxxxx"
              className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm font-mono placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Your token is never stored. It is only used for this session.
          </p>
        </div>

        {!githubUser && (
          <button
            onClick={handleVerifyToken}
            disabled={!token.trim()}
            className={cn(
              "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
              "border border-border hover:bg-accent",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            Verify Token
          </button>
        )}

        {githubUser && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-500">
              Authenticated as <strong>{githubUser}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Submission Summary
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Package:</span>
            <span className="ml-2 font-medium">{manifest.packageIdentifier}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Version:</span>
            <span className="ml-2 font-medium">{manifest.packageVersion}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Installers:</span>
            <span className="ml-2 font-medium">{manifest.installers.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Files:</span>
            <span className="ml-2 font-medium">{generatedYaml.length}</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep("review")}
          className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={!githubUser || isSubmitting}
          className={cn(
            "flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors",
            "bg-emerald-600 text-white hover:bg-emerald-500",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit Pull Request
            </>
          )}
        </button>
      </div>
    </div>
  );
}
