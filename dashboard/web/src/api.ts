import type {
  ArticleDetail,
  ArticleFilters,
  ArticleSummary,
  BatchSummary,
  BusinessRuleStats,
  ConfidenceDistribution,
  JournalStats,
  ManualReviewEntry,
  MissingFileStat,
  RecoveryRuleStats,
  ReviewNote,
  ReviewStatus,
  RunStatus,
  SummaryStats,
  ValidationStats,
  WarningStats,
  InputSummary,
  StartRunOptions,
} from "./types";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((parsed as { error?: string }).error ?? `Request failed (${response.status})`);
  }
  return parsed as T;
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((parsed as { error?: string }).error ?? `Request failed (${response.status})`);
  }
  return parsed as T;
}

function batchQuery(batchId: string | null, extra?: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  if (batchId) params.set("batch", batchId);
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  getBatches: () => getJson<BatchSummary[]>("/batches"),
  getSummary: (batchId: string | null) => getJson<SummaryStats>(`/summary${batchQuery(batchId)}`),
  getJournals: (batchId: string | null) => getJson<JournalStats[]>(`/journals${batchQuery(batchId)}`),
  getArticles: (batchId: string | null, filters: ArticleFilters = {}) =>
    getJson<ArticleSummary[]>(
      `/articles${batchQuery(batchId, filters as Record<string, string | undefined>)}`,
    ),
  getArticle: (batchId: string | null, id: string) =>
    getJson<ArticleDetail>(`/articles/${encodeURIComponent(id)}${batchQuery(batchId)}`),
  getManualReview: (batchId: string | null) =>
    getJson<ManualReviewEntry[]>(`/manual-review${batchQuery(batchId)}`),
  setManualReviewNote: (batchId: string | null, articleId: string, update: { note?: string; status?: ReviewStatus }) =>
    putJson<ReviewNote>(`/manual-review/${encodeURIComponent(articleId)}/note${batchQuery(batchId)}`, update),
  getRecoveryRuleStats: (batchId: string | null) =>
    getJson<RecoveryRuleStats[]>(`/analytics/recovery-rules${batchQuery(batchId)}`),
  getWarningStats: (batchId: string | null) =>
    getJson<WarningStats[]>(`/analytics/warnings${batchQuery(batchId)}`),
  getConfidenceDistribution: (batchId: string | null) =>
    getJson<ConfidenceDistribution | null>(`/analytics/confidence${batchQuery(batchId)}`),
  getBusinessRuleStats: (batchId: string | null) =>
    getJson<BusinessRuleStats[]>(`/analytics/business-rules${batchQuery(batchId)}`),
  getTopMissingFiles: (batchId: string | null) =>
    getJson<MissingFileStat[]>(`/analytics/missing-files${batchQuery(batchId)}`),
  getValidationStats: (batchId: string | null) =>
    getJson<ValidationStats>(`/analytics/validation${batchQuery(batchId)}`),

  zipDownloadUrl: (batchId: string | null, id: string) =>
    `/api/articles/${encodeURIComponent(id)}/download/zip${batchQuery(batchId)}`,
  certificationDownloadUrl: (batchId: string | null, id: string) =>
    `/api/articles/${encodeURIComponent(id)}/download/certification${batchQuery(batchId)}`,
  certificationViewUrl: (batchId: string | null, id: string) =>
    `/api/articles/${encodeURIComponent(id)}/view/certification${batchQuery(batchId)}`,
  validationReportDownloadUrl: (batchId: string | null, id: string) =>
    `/api/articles/${encodeURIComponent(id)}/download/validation${batchQuery(batchId)}`,
  validationReportViewUrl: (batchId: string | null, id: string) =>
    `/api/articles/${encodeURIComponent(id)}/view/validation${batchQuery(batchId)}`,
  reportJsonDownloadUrl: (batchId: string | null, id: string) =>
    `/api/articles/${encodeURIComponent(id)}/download/report${batchQuery(batchId)}`,
  migrationAuditReportDownloadUrl: (batchId: string | null, id: string) =>
    `/api/articles/${encodeURIComponent(id)}/download/migration-audit-report${batchQuery(batchId)}`,
  migrationAuditReportViewUrl: (batchId: string | null, id: string) =>
    `/api/articles/${encodeURIComponent(id)}/view/migration-audit-report${batchQuery(batchId)}`,
  migrationAuditJsonDownloadUrl: (batchId: string | null, id: string) =>
    `/api/articles/${encodeURIComponent(id)}/download/migration-audit-json${batchQuery(batchId)}`,
  xmlDownloadUrl: (batchId: string | null, id: string, kind: string) =>
    `/api/articles/${encodeURIComponent(id)}/download/xml/${kind}${batchQuery(batchId)}`,
  reportFileDownloadUrl: (batchId: string | null, filename: string) =>
    `/api/reports/${encodeURIComponent(filename)}${batchQuery(batchId)}`,

  getRunStatus: () => getJson<RunStatus>("/run/status"),
  getRunLogs: () => getJson<string[]>("/run/logs"),
  getInputSummary: (format?: string) =>
    getJson<InputSummary>(`/input/summary${format ? `?format=${encodeURIComponent(format)}` : ""}`),
  startRun: (options?: StartRunOptions | string[]) => {
    const payload = Array.isArray(options) ? { articleIds: options } : options ?? {};
    return postJson<{ batchId: string }>("/run/start", payload);
  },
  pauseRun: () => postJson<{ ok: true }>("/run/pause"),
  resumeRun: () => postJson<{ ok: true }>("/run/resume"),
  stopAfterCurrent: () => postJson<{ ok: true }>("/run/stop-after-current"),
  cancelRun: () => postJson<{ ok: true }>("/run/cancel"),
  restartFailed: (batchId: string | null) =>
    postJson<{ batchId: string }>(`/run/restart-failed${batchQuery(batchId)}`),
  restartManualReview: (batchId: string | null) =>
    postJson<{ batchId: string }>(`/run/restart-manual-review${batchQuery(batchId)}`),

  getConfig: () => getJson<Record<string, unknown>>("/config"),
  updateConfig: (updates: Record<string, unknown>) => putJson<Record<string, unknown>>("/config", updates),
};
