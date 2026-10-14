import { Router, type Request, type Response } from "express";
import {
  getSummary,
  listJournals,
  listArticles,
  getArticle,
  getArticleFile,
  listManualReview,
  listFailedArticleIds,
  listManualReviewArticleIds,
  getRecoveryRuleStats,
  getWarningStats,
  getBusinessRuleStats,
  getTopMissingFiles,
  getConfidenceDistribution,
  getConversionReportJson,
  getMigrationAuditJson,
  getBatchSummaryStats,
  getValidationStats,
} from "./dataStore.js";
import { listBatches, resolveBatchId, resolveReportFile, latestBatchId } from "./batchStore.js";
import { runController, getInputSummary } from "./runController.js";
import { readRuntimeConfig, updateRuntimeConfig } from "./configStore.js";
import { getArticleXml, XML_KINDS } from "./xmlStore.js";
import { getNotes, setNote } from "./notesStore.js";
import { reviewService, logService, checkDatabaseConnection, batchService } from "./db/index.js";
import type { ArticleSummary, ReviewStatus } from "./types.js";

export const router = Router();


function requireBatch(req: Request, res: Response): string | null {
  const batchId = resolveBatchId(req.query.batch as string | undefined);
  if (!batchId) {
    res.status(404).json({ error: "No migration has run yet" });
    return null;
  }
  return batchId;
}

router.get("/batches", (_req, res) => {
  const batches = listBatches().map((b) => ({ ...b, ...getBatchSummaryStats(b.batch_id) }));
  res.json(batches);
});

router.get("/summary", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  res.json(getSummary(batchId));
});

router.get("/journals", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  res.json(listJournals(batchId));
});

router.get("/articles", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;

  let articles = listArticles(batchId);
  const { q, journal, status, confidence, recovery_rule, business_rule, warning, validation, dtd_result } =
    req.query as Record<string, string | undefined>;

  if (journal) articles = articles.filter((a) => a.journal === journal);
  if (status) articles = articles.filter((a) => a.status === status);
  if (confidence) articles = articles.filter((a) => a.overall_confidence === confidence);

  if (recovery_rule || business_rule || warning || validation || dtd_result || q) {
    const detailed = articles.map((a) => ({ summary: a, detail: getArticle(batchId, a.article_id) }));
    articles = detailed
      .filter(({ detail }) => {
        if (!detail) return false;
        if (recovery_rule && !detail.recovery_rules_applied.includes(recovery_rule)) return false;
        if (business_rule && !detail.business_rules_failed.includes(business_rule)) return false;
        if (
          warning &&
          ![...detail.warnings, ...detail.recoveries].some((w) => w.code === warning)
        )
          return false;
        if (validation && detail.validation_report?.overall_result !== validation) return false;
        if (dtd_result) {
          const actual = detail.validation_report?.overall_dtd_result ?? "not_checked";
          if (actual !== dtd_result) return false;
        }
        if (q) {
          const haystack = [
            detail.article_id,
            detail.journal,
            detail.status,
            ...detail.recovery_rules_applied,
            ...detail.business_rules_failed,
            ...detail.warnings.map((w) => w.code),
            ...detail.recoveries.map((w) => w.code),
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q.toLowerCase())) return false;
        }
        return true;
      })
      .map(({ summary }): ArticleSummary => summary);
  }

  res.json(articles);
});

router.get("/articles/:id", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const article = getArticle(batchId, req.params.id);
  if (!article) {
    res.status(404).json({ error: `Unknown article: ${req.params.id}` });
    return;
  }
  res.json(article);
});

router.get("/articles/:id/download/zip", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const path = getArticleFile(batchId, req.params.id, "zip");
  if (!path) {
    res.status(404).json({ error: "No package available for this article" });
    return;
  }
  res.download(path);
});

router.get("/articles/:id/download/certification", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const path = getArticleFile(batchId, req.params.id, "certification");
  if (!path) {
    res.status(404).json({ error: "No certification report available for this article" });
    return;
  }
  res.download(path);
});

router.get("/articles/:id/view/certification", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const path = getArticleFile(batchId, req.params.id, "certification");
  if (!path) {
    res.status(404).json({ error: "No certification report available for this article" });
    return;
  }
  res.sendFile(path);
});

router.get("/articles/:id/download/validation", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const path = getArticleFile(batchId, req.params.id, "validation");
  if (!path) {
    res.status(404).json({ error: "No validation report available for this article" });
    return;
  }
  res.download(path);
});

router.get("/articles/:id/view/validation", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const path = getArticleFile(batchId, req.params.id, "validation");
  if (!path) {
    res.status(404).json({ error: "No validation report available for this article" });
    return;
  }
  res.sendFile(path);
});

router.get("/articles/:id/download/migration-audit-report", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const path = getArticleFile(batchId, req.params.id, "migration-audit-html");
  if (!path) {
    res.status(404).json({ error: "No Migration Audit Report available for this article" });
    return;
  }
  res.download(path);
});

router.get("/articles/:id/view/migration-audit-report", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const path = getArticleFile(batchId, req.params.id, "migration-audit-html");
  if (!path) {
    res.status(404).json({ error: "No Migration Audit Report available for this article" });
    return;
  }
  res.sendFile(path);
});

router.get("/articles/:id/download/migration-audit-json", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const audit = getMigrationAuditJson(batchId, req.params.id);
  if (!audit) {
    res.status(404).json({ error: "No migration-audit.json available for this article" });
    return;
  }
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${req.params.id}-migration-audit.json"`,
  );
  res.json(audit);
});

router.get("/articles/:id/download/report", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const report = getConversionReportJson(batchId, req.params.id);
  if (!report) {
    res.status(404).json({ error: `Unknown article: ${req.params.id}` });
    return;
  }
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${req.params.id}-conversion-report.json"`,
  );
  res.json(report);
});

router.get("/articles/:id/download/xml/:kind", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  if (!XML_KINDS.includes(req.params.kind)) {
    res.status(400).json({ error: `Unknown XML kind: ${req.params.kind}` });
    return;
  }
  const xml = getArticleXml(batchId, req.params.id, req.params.kind);
  if (!xml) {
    res.status(404).json({ error: "That XML document is not available for this article" });
    return;
  }
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename="${xml.name}"`);
  res.send(xml.data);
});

router.get("/manual-review", async (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;

  // 1. Try fetching reviews from PostgreSQL
  const dbReviews = await reviewService.getReviewsByBatchId(batchId);
  const dbNotesMap: Record<string, { note: string; status: ReviewStatus }> = {};
  for (const r of dbReviews) {
    dbNotesMap[r.articleId] = {
      note: r.note,
      status: (r.status as ReviewStatus) ?? "pending",
    };
  }

  // 2. Fallback / merge with local JSON notes if any
  const fileNotes = getNotes(batchId);

  const entries = listManualReview(batchId).map((entry) => ({
    ...entry,
    note: dbNotesMap[entry.article_id]?.note ?? fileNotes[entry.article_id]?.note ?? "",
    status: dbNotesMap[entry.article_id]?.status ?? fileNotes[entry.article_id]?.status ?? "pending",
  }));
  res.json(entries);
});

router.put("/manual-review/:id/note", async (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const { note, status } = req.body as { note?: string; status?: ReviewStatus };

  // 1. Save to local JSON file for backward compatibility
  const notes = setNote(batchId, req.params.id, { note, status });

  // 2. Persist to PostgreSQL database
  await reviewService.upsertReview({
    batchId,
    articleId: req.params.id,
    note,
    status,
  });

  res.json(notes[req.params.id]);
});

router.get("/reports/:filename", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const path = resolveReportFile(batchId, req.params.filename);
  if (!path) {
    res.status(404).json({ error: `Report not available: ${req.params.filename}` });
    return;
  }
  res.download(path);
});

router.get("/analytics/recovery-rules", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  res.json(getRecoveryRuleStats(batchId));
});

router.get("/analytics/warnings", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  res.json(getWarningStats(batchId));
});

router.get("/analytics/business-rules", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  res.json(getBusinessRuleStats(batchId));
});

router.get("/analytics/missing-files", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  res.json(getTopMissingFiles(batchId));
});

router.get("/analytics/confidence", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  res.json(getConfidenceDistribution(batchId));
});

router.get("/analytics/validation", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  res.json(getValidationStats(batchId));
});

// --- Run control ---

router.get("/run/status", (_req, res) => {
  res.json({ ...runController.getState(), liveStatus: runController.getLiveStatus() });
});

router.get("/run/logs", async (req, res) => {
  const memoryLogs = runController.getLogs();
  // If active run is in memory, return active stream
  if (memoryLogs.length > 0) {
    res.json(memoryLogs);
    return;
  }

  // If memory buffer is empty (e.g. server restarted or querying past batch),
  // retrieve from PostgreSQL batch_logs
  const requestedBatch = req.query.batch as string | undefined;
  const batchId = resolveBatchId(requestedBatch) ?? latestBatchId();
  if (batchId) {
    const dbLogs = await logService.getLogsByBatchId(batchId);
    if (dbLogs.length > 0) {
      res.json(dbLogs.map((l) => l.message));
      return;
    }
  }

  res.json([]);
});

// Database health check (checks PostgreSQL connectivity for local and AWS ECS)
router.get("/health", async (_req, res) => {
  const dbStatus = await checkDatabaseConnection();
  const isProd = process.env.NODE_ENV === "production";
  if (dbStatus.disabled) {
    res.status(200).json({
      status: "healthy",
      database: "disabled (file-based mode)",
      timestamp: new Date().toISOString(),
    });
    return;
  }
  res.status(dbStatus.ok ? 200 : 503).json({
    status: dbStatus.ok ? "healthy" : "degraded",
    database: dbStatus.ok ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
    // Never leak internal database host, user, or password stacktraces in production responses
    ...(!dbStatus.ok && { error: isProd ? "Database unavailable" : dbStatus.error }),
  });
});

// Historical batch logs from PostgreSQL
router.get("/logs/:batchId", async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 500;
  const logs = await logService.getLogsByBatchId(req.params.batchId, limit);
  res.json(logs);
});

// List batches directly from PostgreSQL
router.get("/db/batches", async (_req, res) => {
  const batches = await batchService.listBatches();
  res.json(batches);
});

router.get("/input/summary", async (req, res) => {
  try {
    const format = (req.query.format as string) || "directory";
    const summary = await getInputSummary(format);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/run/start", (req, res) => {
  try {
    const { articleIds, limit, offset, inputFormat } = req.body as {
      articleIds?: string[];
      limit?: number;
      offset?: number;
      inputFormat?: "directory" | "zip";
    };
    res.json(runController.start({ articleIds, limit, offset, inputFormat }));
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/run/pause", (_req, res) => {
  try {
    runController.pause();
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/run/resume", (_req, res) => {
  try {
    runController.resume();
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/run/stop-after-current", (_req, res) => {
  try {
    runController.stopAfterCurrent();
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/run/cancel", (_req, res) => {
  try {
    runController.cancel();
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/run/restart-failed", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const articleIds = listFailedArticleIds(batchId);
  if (articleIds.length === 0) {
    res.status(400).json({ error: "No failed articles in the selected batch" });
    return;
  }
  try {
    res.json(runController.start(articleIds));
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/run/restart-manual-review", (req, res) => {
  const batchId = requireBatch(req, res);
  if (!batchId) return;
  const articleIds = listManualReviewArticleIds(batchId);
  if (articleIds.length === 0) {
    res.status(400).json({ error: "No manual-review articles in the selected batch" });
    return;
  }
  try {
    res.json(runController.start(articleIds));
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Configuration ---

router.get("/config", (_req, res) => {
  res.json(readRuntimeConfig());
});

router.put("/config", (req, res) => {
  updateRuntimeConfig(req.body as Record<string, unknown>)
    .then((merged) => res.json(merged))
    .catch((err: unknown) => {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    });
});
