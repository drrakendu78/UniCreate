import { useManifestStore } from "@/stores/manifest-store";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, ChevronDown, X, Globe, Check, AlertCircle, Plus, Trash2, Languages } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const locales = [
  { value: "en-US", label: "English (US)" },
  { value: "fr-FR", label: "Fran\u00e7ais (FR)" },
  { value: "de-DE", label: "Deutsch (DE)" },
  { value: "es-ES", label: "Espa\u00f1ol (ES)" },
  { value: "it-IT", label: "Italiano (IT)" },
  { value: "pt-BR", label: "Portugu\u00eas (BR)" },
  { value: "ja-JP", label: "\u65e5\u672c\u8a9e (JP)" },
  { value: "zh-CN", label: "\u4e2d\u6587 (CN)" },
  { value: "ko-KR", label: "\ud55c\uad6d\uc5b4 (KR)" },
  { value: "ru-RU", label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439 (RU)" },
  { value: "nl-NL", label: "Nederlands (NL)" },
  { value: "pl-PL", label: "Polski (PL)" },
  { value: "sv-SE", label: "Svenska (SE)" },
  { value: "tr-TR", label: "T\u00fcrk\u00e7e (TR)" },
  { value: "ar-SA", label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629 (SA)" },
];

function Field({ label, required, value, onChange, placeholder, multiline, hint, error, suffix }: {
  label: string; required?: boolean; value: string; onChange: (val: string) => void;
  placeholder?: string; multiline?: boolean; hint?: string; error?: string; suffix?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-medium text-foreground/70">
        {label}{required && <span className="ml-0.5 text-primary">*</span>}
      </label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
          className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-[13px] resize-none placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
      ) : (
        <div className="relative">
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            className={cn("h-9 w-full rounded-lg border bg-background/50 px-3 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all",
              error ? "border-destructive/50" : "border-border", suffix ? "pr-8" : "")} />
          {suffix && <div className="absolute right-2.5 top-1/2 -translate-y-1/2">{suffix}</div>}
        </div>
      )}
      {error && <p className="text-[11px] text-destructive/70">{error}</p>}
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TagsInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const addTag = () => { const tag = input.trim(); if (tag && !value.includes(tag)) { onChange([...value, tag]); setInput(""); } };
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-medium text-foreground/70">Tags</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-md bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary/80">
              {tag}
              <button onClick={() => onChange(value.filter((t) => t !== tag))} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
        </div>
      )}
      <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
        placeholder="Type and press Enter..." className="h-8 w-full rounded-lg border border-border bg-background/50 px-3 text-[12px] placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
    </div>
  );
}

export function StepMetadata() {
  const { manifest, setPackageIdentifier, setPackageVersion, setDefaultLocale, setLocale, setStep, addAdditionalLocale, updateAdditionalLocale, removeAdditionalLocale } = useManifestStore();
  const [showOptional, setShowOptional] = useState(false);
  const [showLocales, setShowLocales] = useState(!!manifest.additionalLocales?.length);
  const locale = manifest.locale;

  const [idStatus, setIdStatus] = useState<"idle" | "checking" | "exists" | "available" | "invalid">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const idFormatValid = /^[A-Za-z0-9]+\.[A-Za-z0-9.]+$/.test(manifest.packageIdentifier);

  useEffect(() => {
    const id = manifest.packageIdentifier;
    if (!id || !idFormatValid) { setIdStatus(id && !idFormatValid ? "invalid" : "idle"); return; }
    setIdStatus("checking");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const exists = await invoke<boolean>("check_package_exists", { packageId: id });
        setIdStatus(exists ? "exists" : "available");
      } catch { setIdStatus("idle"); }
    }, 800);
    return () => clearTimeout(debounceRef.current);
  }, [manifest.packageIdentifier, idFormatValid]);

  const idSuffix = (() => {
    if (idStatus === "checking") return <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />;
    if (idStatus === "exists") return <Check className="h-3.5 w-3.5 text-emerald-500" />;
    if (idStatus === "available") return <span className="text-[10px] font-medium text-blue-400">NEW</span>;
    if (idStatus === "invalid") return <AlertCircle className="h-3.5 w-3.5 text-destructive/60" />;
    return null;
  })();

  const isValid = manifest.packageIdentifier.includes(".") && idFormatValid &&
    manifest.packageVersion.trim() !== "" && locale.publisher.trim() !== "" &&
    locale.packageName.trim() !== "" && locale.license.trim() !== "" && locale.shortDescription.trim() !== "";

  const handleAddLocale = () => {
    const used = [locale.packageLocale, ...(manifest.additionalLocales || []).map((l) => l.packageLocale)];
    const available = locales.find((l) => !used.includes(l.value));
    if (!available) return;
    addAdditionalLocale({ packageLocale: available.value, publisher: locale.publisher, packageName: "", license: locale.license, shortDescription: "" });
    setShowLocales(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2"><span>Step 2 of 4</span></div>
        <h2 className="text-xl font-semibold tracking-tight">Package Metadata</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
          Provide information about your package. Fields marked with <span className="text-primary">*</span> are required by WinGet.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-card/50 p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Identity</h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Package Identifier" required value={manifest.packageIdentifier} onChange={setPackageIdentifier}
            placeholder="Publisher.PackageName" hint={idStatus === "exists" ? "Exists in winget-pkgs" : idStatus === "available" ? "New package" : "Format: Publisher.Package"}
            error={idStatus === "invalid" ? "Format: Publisher.Package (letters/numbers)" : undefined} suffix={idSuffix} />
          <Field label="Version" required value={manifest.packageVersion} onChange={setPackageVersion} placeholder="1.0.0" />
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/70"><Globe className="h-3 w-3" />Locale</label>
            <select value={locale.packageLocale} onChange={(e) => { setDefaultLocale(e.target.value); setLocale({ packageLocale: e.target.value }); }}
              className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-[13px] focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all">
              {locales.map((l) => (<option key={l.value} value={l.value}>{l.label}</option>))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card/50 p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Required</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Publisher" required value={locale.publisher} onChange={(v) => setLocale({ publisher: v })} placeholder="Company or author name" />
          <Field label="Package Name" required value={locale.packageName} onChange={(v) => setLocale({ packageName: v })} placeholder="My Application" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="License" required value={locale.license} onChange={(v) => setLocale({ license: v })} placeholder="MIT" />
          <Field label="Short Description" required value={locale.shortDescription} onChange={(v) => setLocale({ shortDescription: v })} placeholder="A brief description" />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/50 overflow-hidden">
        <button onClick={() => setShowOptional(!showOptional)} className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-accent/30">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Optional Fields</h3>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", showOptional && "rotate-180")} />
        </button>
        {showOptional && (
          <div className="space-y-3 border-t border-border px-5 py-4 animate-fade-in">
            <Field label="Description" value={locale.description || ""} onChange={(v) => setLocale({ description: v })} placeholder="A longer description..." multiline />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Publisher URL" value={locale.publisherUrl || ""} onChange={(v) => setLocale({ publisherUrl: v })} placeholder="https://..." />
              <Field label="Package URL" value={locale.packageUrl || ""} onChange={(v) => setLocale({ packageUrl: v })} placeholder="https://..." />
              <Field label="License URL" value={locale.licenseUrl || ""} onChange={(v) => setLocale({ licenseUrl: v })} placeholder="https://..." />
              <Field label="Privacy URL" value={locale.privacyUrl || ""} onChange={(v) => setLocale({ privacyUrl: v })} placeholder="https://..." />
              <Field label="Author" value={locale.author || ""} onChange={(v) => setLocale({ author: v })} />
              <Field label="Moniker" value={locale.moniker || ""} onChange={(v) => setLocale({ moniker: v })} placeholder="Short alias (e.g. vscode)" hint="Used for quick search" />
            </div>
            <Field label="Release Notes" value={locale.releaseNotes || ""} onChange={(v) => setLocale({ releaseNotes: v })} placeholder="What's new..." multiline />
            <Field label="Release Notes URL" value={locale.releaseNotesUrl || ""} onChange={(v) => setLocale({ releaseNotesUrl: v })} placeholder="https://..." />
            <TagsInput value={locale.tags || []} onChange={(tags) => setLocale({ tags })} />
          </div>
        )}
      </section>

      {/* Additional Locales */}
      <section className="rounded-xl border border-border bg-card/50 overflow-hidden">
        <button onClick={() => setShowLocales(!showLocales)} className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-accent/30">
          <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <Languages className="h-3 w-3" />Additional Locales
            {manifest.additionalLocales?.length ? <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] text-primary">{manifest.additionalLocales.length}</span> : null}
          </h3>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", showLocales && "rotate-180")} />
        </button>
        {showLocales && (
          <div className="border-t border-border px-5 py-4 space-y-4 animate-fade-in">
            {(manifest.additionalLocales || []).map((loc, idx) => {
              const usedLocales = [locale.packageLocale, ...(manifest.additionalLocales || []).filter((_, i) => i !== idx).map((l) => l.packageLocale)];
              const availableLocales = locales.filter((l) => !usedLocales.includes(l.value) || l.value === loc.packageLocale);
              return (
                <div key={idx} className="space-y-3 rounded-lg border border-border/50 bg-background/30 p-4">
                  <div className="flex items-center justify-between">
                    <select value={loc.packageLocale} onChange={(e) => updateAdditionalLocale(idx, { packageLocale: e.target.value })}
                      className="h-8 rounded-lg border border-border bg-background/50 px-2 text-[12px] focus:border-primary/50 focus:outline-none">
                      {availableLocales.map((l) => (<option key={l.value} value={l.value}>{l.label}</option>))}
                    </select>
                    <button onClick={() => removeAdditionalLocale(idx)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Package Name" required value={loc.packageName} onChange={(v) => updateAdditionalLocale(idx, { packageName: v })} placeholder="Translated name" />
                    <Field label="Publisher" required value={loc.publisher} onChange={(v) => updateAdditionalLocale(idx, { publisher: v })} placeholder="Publisher" />
                    <Field label="License" required value={loc.license} onChange={(v) => updateAdditionalLocale(idx, { license: v })} placeholder="MIT" />
                    <Field label="Short Description" required value={loc.shortDescription} onChange={(v) => updateAdditionalLocale(idx, { shortDescription: v })} placeholder="Translated description" />
                  </div>
                  <Field label="Description" value={loc.description || ""} onChange={(v) => updateAdditionalLocale(idx, { description: v })} placeholder="Translated long description..." multiline />
                </div>
              );
            })}
            <button onClick={handleAddLocale}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary/70">
              <Plus className="h-3 w-3" />Add locale
            </button>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between pt-1">
        <button onClick={() => setStep("installer")} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </button>
        <button onClick={() => setStep("review")} disabled={!isValid} data-action="primary"
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-medium transition-all duration-200",
            "bg-primary text-white hover:brightness-110 active:scale-[0.98]", "disabled:cursor-not-allowed disabled:opacity-40")}>
          Continue<ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
