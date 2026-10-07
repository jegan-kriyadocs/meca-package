import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Activity, Play, Pause, StepForward, XCircle, RefreshCw, ShieldAlert, ClipboardList, FolderOpen, Archive } from "lucide-react";
import { api } from "../api";
import { useRunStatus } from "../hooks/useRunStatus";
import { useBatch } from "../context/BatchContext";
import type { SummaryStats, InputSummary } from "../types";

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function ControlCenterPage() {
  const runStatus = useRunStatus();
  const { refreshBatches } = useBatch();
  const [liveSummary, setLiveSummary] = useState<SummaryStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // Input source and execution scope
  const [inputSummary, setInputSummary] = useState<InputSummary | null>(null);
  const [loadingInputSummary, setLoadingInputSummary] = useState(false);
  const [limitInput, setLimitInput] = useState<string>("");
  const [offsetInput, setOffsetInput] = useState<string>("0");
  const [formatInput, setFormatInput] = useState<"directory" | "zip">("directory");

  const fetchInputSummary = useCallback((fmt?: "directory" | "zip") => {
    const targetFmt = fmt ?? formatInput;
    setLoadingInputSummary(true);
    api.getInputSummary(targetFmt)
      .then((res) => setInputSummary(res))
      .catch((err) => {
        setInputSummary({
          provider: "UNKNOWN",
          path: "",
          total: 0,
          articles: [],
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => setLoadingInputSummary(false));
  }, [formatInput]);

  const handleFormatChange = (fmt: "directory" | "zip") => {
    setFormatInput(fmt);
    fetchInputSummary(fmt);
  };

  useEffect(() => {
    fetchInputSummary();
  }, [fetchInputSummary]);

  const activeBatchId = runStatus?.batchId ?? null;
  const isActive = runStatus?.phase === "running" || runStatus?.phase === "starting";
  const live = runStatus?.liveStatus ?? null;

  useEffect(() => {
    if (!activeBatchId) {
      setLiveSummary(null);
      return;
    }
    let cancelled = false;
    const poll = () => api.getSummary(activeBatchId).then((s) => !cancelled && setLiveSummary(s)).catch(() => undefined);
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeBatchId]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => api.getRunLogs().then((l) => !cancelled && setLogLines(l.slice(-8))).catch(() => undefined);
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logLines]);

  const run = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        toast.success(label);
        refreshBatches();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [refreshBatches],
  );

  const waiting = !runStatus || runStatus.phase === "idle";
  const jobState = waiting
    ? "Waiting"
    : runStatus.phase === "starting"
      ? "Starting"
      : runStatus.liveStatus?.state === "processing"
        ? "Processing"
        : runStatus.liveStatus?.state === "completed"
          ? "Completed"
          : runStatus.liveStatus?.state === "stopped"
            ? "Stopped"
            : runStatus.liveStatus?.state === "cancelled"
              ? "Cancelled"
              : "Idle";

  const progressPct = live && live.total > 0 ? Math.round((live.completed / live.total) * 100) : 0;
  const succeeded = liveSummary?.category_counts.uploaded ?? 0;
  const manualReview = liveSummary?.category_counts.manual_review ?? 0;
  const failed = liveSummary?.category_counts.failed ?? 0;

  const totalArticles = inputSummary?.total ?? 0;
  const offsetVal = Math.max(0, parseInt(offsetInput || "0", 10) || 0);
  const limitVal = limitInput ? parseInt(limitInput, 10) : null;
  const formatLabel =
    formatInput === "directory" ? "Directory (folders)" : "ZIP archives";
  let previewScope = "";
  if (limitVal !== null && limitVal > 0) {
    const toVal = totalArticles > 0 ? Math.min(offsetVal + limitVal, totalArticles) : offsetVal + limitVal;
    previewScope = `Scope: processing ${limitVal} article(s) (from #${offsetVal + 1} to #${toVal}${totalArticles ? ` of ${totalArticles}` : ""}) via ${formatLabel}`;
  } else {
    previewScope = `Scope: processing all ${totalArticles ? `${totalArticles} ` : ""}articles${offsetVal > 0 ? ` starting from #${offsetVal + 1}` : ""} via ${formatLabel}`;
  }

  const handleStartMigration = () => {
    const limit = limitInput ? parseInt(limitInput, 10) : undefined;
    const offset = offsetInput ? parseInt(offsetInput, 10) : 0;
    run("Migration started", () => api.startRun({ limit, offset, inputFormat: formatInput }));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>
            <Activity size={22} /> Control Center
          </h1>
          <p className="subtitle">Live batch execution &amp; operator controls</p>
        </div>
        {isActive && (
          <span className="live-pill">
            <span className="live-pill-dot live-pill-dot-pulse" />
            LIVE &middot; {jobState.toUpperCase()}
          </span>
        )}
      </div>

      <div className="run-card" style={{ gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="run-card-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FolderOpen size={13} /> Input Source &amp; Scope
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <span className="badge" style={{ textTransform: "uppercase", fontWeight: 700 }}>
                {inputSummary?.provider ?? "Detecting..."}
              </span>
              <span className="mono" style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {inputSummary?.path || "Loading path..."}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "var(--text)" }}>
              Total Files Available:{" "}
              <strong style={{ color: "var(--accent)", fontSize: 16 }}>
                {inputSummary ? inputSummary.total : "..."}
              </strong>{" "}
              articles
            </span>
            <button
              className="button button-secondary"
              style={{ padding: "4px 8px", fontSize: 12 }}
              onClick={() => fetchInputSummary()}
              disabled={loadingInputSummary || busy}
              title="Rescan input files"
            >
              <RefreshCw size={12} className={loadingInputSummary ? "spin" : ""} /> Rescan
            </button>
          </div>
        </div>

        {inputSummary?.error && (
          <div style={{ padding: "8px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", fontSize: 12 }}>
            <strong>Input Notice:</strong> {inputSummary.error}
          </div>
        )}

        {/* Input format selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Input Format Mode
            </span>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {formatInput === "directory"
                ? "Direct folder referencing — 0% unzipping overhead (DevOps Standard)"
                : "Standard .zip archive scanning and extraction"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              {
                id: "directory",
                label: "Directory Only (Folders)",
                badge: "Default",
                desc: "Scans uncompressed directories under /Input/",
                icon: <FolderOpen size={14} />,
              },
              {
                id: "zip",
                label: "ZIP Only (*.zip)",
                badge: "Archives",
                desc: "Scans and extracts *.zip archives",
                icon: <Archive size={14} />,
              },
            ].map((fmt) => {
              const selected = formatInput === fmt.id;
              return (
                <button
                  key={fmt.id}
                  id={`input-format-${fmt.id}`}
                  type="button"
                  onClick={() => handleFormatChange(fmt.id as "directory" | "zip")}
                  disabled={isActive || busy}
                  className={`button ${selected ? "" : "button-secondary"}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: selected ? 600 : 500,
                    borderColor: selected ? "var(--accent)" : "var(--border)",
                    background: selected ? "var(--accent)" : "var(--surface)",
                    color: selected ? "#ffffff" : "var(--text)",
                    boxShadow: selected ? "0 2px 8px rgba(79, 70, 229, 0.25)" : "none",
                    transition: "all 0.15s ease",
                    cursor: isActive || busy ? "not-allowed" : "pointer",
                  }}
                  title={fmt.desc}
                >
                  {fmt.icon}
                  <span>{fmt.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: selected ? "rgba(255, 255, 255, 0.25)" : "var(--surface-alt)",
                      color: selected ? "#ffffff" : "var(--text-muted)",
                      marginLeft: 2,
                    }}
                  >
                    {fmt.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Start From (Offset)
            </label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={offsetInput}
              onChange={(e) => setOffsetInput(e.target.value)}
              disabled={isActive || busy}
              style={{ width: 110, padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--text)" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Batch Limit (Count)
            </label>
            <input
              type="number"
              min={1}
              placeholder="All"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              disabled={isActive || busy}
              style={{ width: 110, padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--text)" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>Quick Presets</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { label: "5", val: "5" },
                { label: "25", val: "25" },
                { label: "50", val: "50" },
                { label: "All", val: "" },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="button button-secondary"
                  style={{ padding: "4px 9px", fontSize: 12, height: 32 }}
                  disabled={isActive || busy}
                  onClick={() => setLimitInput(p.val)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>
            {previewScope}
          </div>
        </div>
      </div>

      <div className="run-card">
        <div className="run-card-header">
          <div>
            <div className="run-card-label">{waiting ? "Status" : "Currently Processing"}</div>
            <div className="run-card-article mono">{live?.current_article_id ?? jobState}</div>
          </div>
          <div className="button-row" style={{ marginBottom: 0 }}>
            <button
              className="button"
              disabled={busy || isActive}
              onClick={handleStartMigration}
            >
              <Play size={14} /> Start Migration
            </button>
            <button
              className="button button-secondary"
              disabled={busy || !isActive || runStatus?.paused}
              onClick={() => run("Paused", () => api.pauseRun())}
            >
              <Pause size={14} /> Pause
            </button>
            <button
              className="button button-secondary"
              disabled={busy || !isActive || !runStatus?.paused}
              onClick={() => run("Resumed", () => api.resumeRun())}
            >
              <Play size={14} /> Resume
            </button>
            <button
              className="button button-secondary"
              disabled={busy || !isActive}
              onClick={() => run("Will stop after the current article", () => api.stopAfterCurrent())}
            >
              <StepForward size={14} /> Stop After Current
            </button>
            <button
              className="button button-danger"
              disabled={busy || !isActive}
              onClick={() => run("Batch cancelled", () => api.cancelRun())}
            >
              <XCircle size={14} /> Cancel
            </button>
          </div>
        </div>

        {live && (
          <div>
            <div className="progress-row">
              <span>
                {live.completed} of {live.total} articles &middot;{" "}
                {formatSeconds(live.estimated_remaining_seconds)} remaining
              </span>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{progressPct}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        <div className="run-stat-row">
          <div className="run-stat">
            <span className="run-stat-value">{live?.completed ?? 0}</span>
            <span className="run-stat-label">Processed</span>
          </div>
          <div className="run-stat">
            <span className="run-stat-value" style={{ color: "var(--success)" }}>
              {succeeded}
            </span>
            <span className="run-stat-label">Succeeded</span>
          </div>
          <div className="run-stat">
            <span className="run-stat-value" style={{ color: "var(--warning)" }}>
              {manualReview}
            </span>
            <span className="run-stat-label">Manual Review</span>
          </div>
          <div className="run-stat">
            <span className="run-stat-value" style={{ color: "var(--danger)" }}>
              {failed}
            </span>
            <span className="run-stat-label">Failed</span>
          </div>
          <div className="run-stat">
            <span className="run-stat-value">
              {live?.articles_per_second ? `${live.articles_per_second.toFixed(2)}/s` : "—"}
            </span>
            <span className="run-stat-label">Throughput</span>
          </div>
        </div>
      </div>

      <div className="console-grid">
        <div className="live-log-panel">
          <div className="live-log-header">
            <span className="live-log-title">LIVE LOG</span>
            <span className="live-pill-dot" style={{ background: isActive ? "#34d399" : "#4b5163" }} />
          </div>
          <div className="live-log-lines" ref={logRef}>
            {logLines.length === 0 && <span style={{ color: "#5b6178" }}>No log output yet.</span>}
            {logLines.map((line, i) => (
              <div className="live-log-line" key={i}>
                {line}
              </div>
            ))}
          </div>
        </div>

        <div className="batch-info-panel">
          <h3 style={{ margin: 0, fontSize: 13 }}>Batch Info</h3>
          <div className="batch-info-row">
            <span className="batch-info-row-label">Batch ID</span>
            <span className="batch-info-row-value mono">{activeBatchId ?? "—"}</span>
          </div>
          <div className="batch-info-row">
            <span className="batch-info-row-label">Phase</span>
            <span className="batch-info-row-value">{jobState}</span>
          </div>
          <div className="batch-info-row">
            <span className="batch-info-row-label">Started At</span>
            <span className="batch-info-row-value">{formatTimestamp(live?.started_at)}</span>
          </div>
          <div className="batch-info-row">
            <span className="batch-info-row-label">Elapsed</span>
            <span className="batch-info-row-value">{formatSeconds(live?.elapsed_seconds ?? null)}</span>
          </div>
          {runStatus?.exitCode != null && (
            <div className="batch-info-row">
              <span className="batch-info-row-label">Exit Code</span>
              <span
                className="batch-info-row-value"
                style={{ color: runStatus.exitCode === 0 ? "var(--success)" : "var(--danger)" }}
              >
                {runStatus.exitCode}
              </span>
            </div>
          )}
        </div>
      </div>

      <h2>Restart</h2>
      <div className="button-row">
        <button
          className="button button-secondary"
          disabled={busy || isActive}
          onClick={() => run("Restarting failed articles", () => api.restartFailed(null))}
        >
          <ShieldAlert size={14} /> Restart Failed Articles
        </button>
        <button
          className="button button-secondary"
          disabled={busy || isActive}
          onClick={() => run("Restarting manual-review articles", () => api.restartManualReview(null))}
        >
          <ClipboardList size={14} /> Restart Manual Review Articles
        </button>
      </div>
      {runStatus?.exitCode != null && runStatus.exitCode !== 0 && (
        <p className="error">
          <RefreshCw size={14} /> Last run exited with code {runStatus.exitCode} — check the Logs page.
        </p>
      )}
    </div>
  );
}
