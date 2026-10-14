import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../api";
import { LoadingState } from "../components/States";

interface FormState {
  inputProvider: string;
  inputLocalPath: string;
  outputProvider: string;
  outputLocalPath: string;
  reportsPath: string;
  workerCount: number;
  maxAttempts: number;
  backoffBaseSeconds: number;
  backoffMultiplier: number;
  backoffMaxSeconds: number;
  loggingLevel: string;
  overwritePolicy: string;
  severityBlockThreshold: string;
}

function toFormState(config: Record<string, any>): FormState {
  return {
    inputProvider: config.input?.provider ?? "LOCAL",
    inputLocalPath: config.input?.local_path ?? "",
    outputProvider: config.output?.provider ?? "LOCAL",
    outputLocalPath: config.output?.local_path ?? "",
    reportsPath: config.dashboard?.reports_path ?? "",
    workerCount: config.concurrency?.worker_count ?? 1,
    maxAttempts: config.retry?.max_attempts ?? 3,
    backoffBaseSeconds: config.retry?.backoff_base_seconds ?? 2,
    backoffMultiplier: config.retry?.backoff_multiplier ?? 2,
    backoffMaxSeconds: config.retry?.backoff_max_seconds ?? 60,
    loggingLevel: config.logging?.level ?? "INFO",
    overwritePolicy: config.packaging?.overwrite_policy ?? "fail",
    severityBlockThreshold: config.validation?.severity_block_threshold ?? "HIGH",
  };
}

function toUpdatePayload(form: FormState): Record<string, unknown> {
  return {
    input: { provider: form.inputProvider, local_path: form.inputLocalPath },
    output: { provider: form.outputProvider, local_path: form.outputLocalPath },
    dashboard: { reports_path: form.reportsPath },
    concurrency: { worker_count: Number(form.workerCount) },
    retry: {
      max_attempts: Number(form.maxAttempts),
      backoff_base_seconds: Number(form.backoffBaseSeconds),
      backoff_multiplier: Number(form.backoffMultiplier),
      backoff_max_seconds: Number(form.backoffMaxSeconds),
    },
    logging: { level: form.loggingLevel },
    packaging: { overwrite_policy: form.overwritePolicy },
    validation: { severity_block_threshold: form.severityBlockThreshold },
  };
}

function validate(form: FormState): string[] {
  const issues: string[] = [];
  if (!form.inputLocalPath.trim()) issues.push("Input local path cannot be empty.");
  if (!form.outputLocalPath.trim()) issues.push("Output local path cannot be empty.");
  if (form.workerCount < 1) issues.push("Worker count must be at least 1.");
  if (form.maxAttempts < 1) issues.push("Retry max attempts must be at least 1.");
  if (form.backoffBaseSeconds < 0) issues.push("Backoff base seconds cannot be negative.");
  return issues;
}

export function ConfigurationPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then((c) => setForm(toFormState(c)));
  }, []);

  if (!form) return <LoadingState label="Loading configuration..." />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm({ ...form, [key]: value });

  const clientIssues = validate(form);

  const save = async () => {
    if (clientIssues.length > 0) {
      toast.error("Fix the highlighted issues before saving");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const merged = await api.updateConfig(toUpdatePayload(form));
      setForm(toFormState(merged));
      setStatus("saved");
      toast.success("Configuration saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>
            <Settings size={20} /> Configuration
          </h1>
          <p className="subtitle">Edits are validated against the engine's own config schema and written to runtime.yaml.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {clientIssues.length === 0 ? (
            <span className="status-pill status-pill-success">
              <CheckCircle2 size={13} /> Config valid
            </span>
          ) : (
            <span className="status-pill status-pill-danger">
              <AlertTriangle size={13} /> {clientIssues.length} issue(s)
            </span>
          )}
          <button className="button" disabled={status === "saving" || clientIssues.length > 0} onClick={save}>
            {status === "saving" ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>

      {clientIssues.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--danger)" }}>
          {clientIssues.map((issue) => (
            <p key={issue} className="error" style={{ margin: "2px 0" }}>
              {issue}
            </p>
          ))}
        </div>
      )}
      {status === "error" && <p className="error">{error}</p>}
      {status === "saved" && <p className="success-text">Saved.</p>}

      <div className="config-grid">
        <div className="config-panel">
          <h3>Input / Output</h3>
          <label className="field">
            Input Provider
            <select value={form.inputProvider} onChange={(e) => set("inputProvider", e.target.value)}>
              <option value="LOCAL">LOCAL</option>
              <option value="S3">S3 (placeholder)</option>
            </select>
          </label>
          <label className="field">
            Input Local Path
            <input value={form.inputLocalPath} onChange={(e) => set("inputLocalPath", e.target.value)} />
          </label>
          <label className="field">
            Output Provider
            <select value={form.outputProvider} onChange={(e) => set("outputProvider", e.target.value)}>
              <option value="LOCAL">LOCAL (Disk Only)</option>
              <option value="SFTP">SFTP (Upload to Remote Server)</option>
            </select>
          </label>
          <label className="field">
            Output Local Path
            <input value={form.outputLocalPath} onChange={(e) => set("outputLocalPath", e.target.value)} />
          </label>
          <label className="field">
            Dashboard Reports Path
            <input value={form.reportsPath} onChange={(e) => set("reportsPath", e.target.value)} />
          </label>
        </div>

        <div className="config-panel">
          <h3>Concurrency &amp; Retry</h3>
          <label className="field">
            Worker Count
            <input
              type="number"
              min={1}
              value={form.workerCount}
              onChange={(e) => set("workerCount", Number(e.target.value))}
            />
          </label>
          <label className="field">
            Retry Max Attempts
            <input
              type="number"
              min={1}
              value={form.maxAttempts}
              onChange={(e) => set("maxAttempts", Number(e.target.value))}
            />
          </label>
          <div className="field-row">
            <label className="field">
              Backoff Base (s)
              <input
                type="number"
                step="0.1"
                value={form.backoffBaseSeconds}
                onChange={(e) => set("backoffBaseSeconds", Number(e.target.value))}
              />
            </label>
            <label className="field">
              Backoff Multiplier
              <input
                type="number"
                step="0.1"
                value={form.backoffMultiplier}
                onChange={(e) => set("backoffMultiplier", Number(e.target.value))}
              />
            </label>
          </div>
          <label className="field">
            Backoff Max Seconds
            <input
              type="number"
              value={form.backoffMaxSeconds}
              onChange={(e) => set("backoffMaxSeconds", Number(e.target.value))}
            />
          </label>
        </div>

        <div className="config-panel config-panel-span">
          <h3>Logging &amp; Processing</h3>
          <div className="field-row">
            <label className="field">
              Logging Level
              <select value={form.loggingLevel} onChange={(e) => set("loggingLevel", e.target.value)}>
                {["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Package Overwrite Policy
              <select value={form.overwritePolicy} onChange={(e) => set("overwritePolicy", e.target.value)}>
                <option value="fail">fail</option>
                <option value="overwrite">overwrite</option>
                <option value="skip">skip</option>
              </select>
            </label>
            <label className="field">
              Validation Severity Block Threshold
              <select
                value={form.severityBlockThreshold}
                onChange={(e) => set("severityBlockThreshold", e.target.value)}
              >
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
