import { useManifestStore } from "@/stores/manifest-store";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronDown, Tag } from "lucide-react";
import { useState } from "react";

function Field({
  label,
  required,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const Component = multiline ? "textarea" : "input";
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      <Component
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        className={cn(
          "w-full rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
          multiline ? "min-h-[80px] py-2 resize-none" : "h-10"
        )}
      />
    </div>
  );
}

function TagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const tag = input.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
      setInput("");
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Tags</label>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
          >
            <Tag className="h-3 w-3" />
            {tag}
            <button
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="ml-0.5 hover:text-destructive"
            >
              x
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
          placeholder="Add tag and press Enter"
          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}

export function StepMetadata() {
  const { manifest, setPackageIdentifier, setPackageVersion, setLocale, setStep } =
    useManifestStore();
  const [showOptional, setShowOptional] = useState(false);

  const locale = manifest.locale;

  const isValid =
    manifest.packageIdentifier.includes(".") &&
    manifest.packageVersion.trim() !== "" &&
    locale.publisher.trim() !== "" &&
    locale.packageName.trim() !== "" &&
    locale.license.trim() !== "" &&
    locale.shortDescription.trim() !== "";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Metadata</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in the package information. Fields marked with * are required.
        </p>
      </div>

      {/* Package Identity */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Package Identity
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Package Identifier"
            required
            value={manifest.packageIdentifier}
            onChange={setPackageIdentifier}
            placeholder="Publisher.PackageName"
          />
          <Field
            label="Package Version"
            required
            value={manifest.packageVersion}
            onChange={setPackageVersion}
            placeholder="1.0.0"
          />
        </div>
      </div>

      {/* Required metadata */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Required Information
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Publisher"
            required
            value={locale.publisher}
            onChange={(v) => setLocale({ publisher: v })}
            placeholder="Your company or name"
          />
          <Field
            label="Package Name"
            required
            value={locale.packageName}
            onChange={(v) => setLocale({ packageName: v })}
            placeholder="My Application"
          />
        </div>
        <Field
          label="License"
          required
          value={locale.license}
          onChange={(v) => setLocale({ license: v })}
          placeholder="MIT"
        />
        <Field
          label="Short Description"
          required
          value={locale.shortDescription}
          onChange={(v) => setLocale({ shortDescription: v })}
          placeholder="A brief description of what your application does"
        />
      </div>

      {/* Optional metadata */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          onClick={() => setShowOptional(!showOptional)}
          className="flex w-full items-center justify-between p-6 text-left hover:bg-accent/50 transition-colors"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Optional Information
          </h3>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              showOptional && "rotate-180"
            )}
          />
        </button>
        {showOptional && (
          <div className="space-y-4 border-t border-border p-6">
            <Field
              label="Description"
              value={locale.description || ""}
              onChange={(v) => setLocale({ description: v })}
              placeholder="A longer description..."
              multiline
            />
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Publisher URL"
                value={locale.publisherUrl || ""}
                onChange={(v) => setLocale({ publisherUrl: v })}
                placeholder="https://..."
              />
              <Field
                label="Package URL"
                value={locale.packageUrl || ""}
                onChange={(v) => setLocale({ packageUrl: v })}
                placeholder="https://..."
              />
              <Field
                label="License URL"
                value={locale.licenseUrl || ""}
                onChange={(v) => setLocale({ licenseUrl: v })}
                placeholder="https://..."
              />
              <Field
                label="Privacy URL"
                value={locale.privacyUrl || ""}
                onChange={(v) => setLocale({ privacyUrl: v })}
                placeholder="https://..."
              />
              <Field
                label="Author"
                value={locale.author || ""}
                onChange={(v) => setLocale({ author: v })}
              />
              <Field
                label="Moniker"
                value={locale.moniker || ""}
                onChange={(v) => setLocale({ moniker: v })}
                placeholder="Short alias (e.g. vscode)"
              />
            </div>
            <Field
              label="Release Notes"
              value={locale.releaseNotes || ""}
              onChange={(v) => setLocale({ releaseNotes: v })}
              placeholder="What's new..."
              multiline
            />
            <Field
              label="Release Notes URL"
              value={locale.releaseNotesUrl || ""}
              onChange={(v) => setLocale({ releaseNotesUrl: v })}
              placeholder="https://..."
            />
            <TagsInput
              value={locale.tags || []}
              onChange={(tags) => setLocale({ tags })}
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep("installer")}
          className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={() => setStep("review")}
          disabled={!isValid}
          className={cn(
            "flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
