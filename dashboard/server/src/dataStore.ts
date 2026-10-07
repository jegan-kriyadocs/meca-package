import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { batchDataRoot, batchPackagesRoot, getBatchDuration } from "./batchStore.js";
import type {
  ConversionReportRecord,
  OutputCategory,
  ArticleLocation,
  ArticleSummary,
  ArticleDetail,
  JournalStats,
  RecoveryRuleStats,
  WarningStats,
  SummaryStats,
  ManualReviewEntry,
  BatchSummary,
  BusinessRuleStats,
  ValidationStats,
  ValidationResultValue,
  DtdResultBucket,
  SpecAlignmentCategory,
} from "./types.js";

function newDtdCounts(): Record<DtdResultBucket, number> {
  return { pass: 0, warning: 0, error: 0, not_checked: 0 };
}

// Every diagnostic message an engine-defect auto-fix logs starts with one
// of these — see generators/article_xml/generator.py's `diagnostics.info(...)`
// calls (duplicate author-notes/aff drops, journal-meta id stripping).
const ENGINE_DEFECT_FIX_PREFIXES = ["Dropped duplicate", "Stripped "];

function countEngineDefectsFixed(report: ConversionReportRecord): number {
  return report.generator_findings.filter((f) =>
    ENGINE_DEFECT_FIX_PREFIXES.some((prefix) => f.message.startsWith(prefix)),
  ).length;
}

function addSpecAlignmentCounts(
  target: Partial<Record<SpecAlignmentCategory, number>>,
  report: ConversionReportRecord,
): void {
  for (const file of report.validation_report?.files ?? []) {
    for (const issue of file.issues) {
      if (!issue.category) continue;
      target[issue.category] = (target[issue.category] ?? 0) + 1;
    }
  }
}

const CATEGORIES: OutputCategory[] = ["uploaded", "manual_review", "failed"];

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

// RC-1 performance review: every dashboard endpoint (articles, summary,
// journals, analytics, manual-review, ...) independently called this,
// each re-reading and re-JSON.parsing the entire conversion_reports.json
// from disk — for a large batch (up to 100k articles), that's the same
// multi-MB parse repeated on every single page load. Cached per batch id,
// invalidated by the file's own mtime so a live-running batch's
// periodic incremental snapshot writes (see `processing_service.py`)
// are still picked up — never serves data staler than the file on disk.
const conversionReportsCache = new Map<
  string,
  { mtimeMs: number; reports: Map<string, ConversionReportRecord> }
>();

function loadConversionReports(batchId: string): Map<string, ConversionReportRecord> {
  const path = join(batchDataRoot(batchId), "conversion_reports.json");
  if (!existsSync(path)) return new Map();

  const mtimeMs = statSync(path).mtimeMs;
  const cached = conversionReportsCache.get(batchId);
  if (cached && cached.mtimeMs === mtimeMs) return cached.reports;

  const records = readJson<ConversionReportRecord[]>(path);
  const reports = new Map(records.map((r) => [r.article_id, r]));
  conversionReportsCache.set(batchId, { mtimeMs, reports });
  return reports;
}

interface DashboardIntelligence {
  journals: Record<
    string,
    {
      journal: string;
      article_count: number;
      status_counts: Record<string, number>;
      average_confidence_score: number;
      recovery_rule_counts: Record<string, number>;
      business_rule_failure_counts: Record<string, number>;
    }
  >;
  recovery_rules: Record<
    string,
    {
      rule_id: string;
      occurrences: number;
      articles_affected: number;
      is_significant_deficiency: boolean;
      clean_success_rate: number;
      dominant_confidence: string;
    }
  >;
  business_rules: Record<
    string,
    {
      rule_id: string;
      total_triggered: number;
      total_recovered: number;
      total_failed: number;
      ever_fatal: boolean;
    }
  >;
  warnings: {
    code: string;
    source: string;
    sample_message: string;
    occurrences: number;
    articles_affected: number;
    always_successful: boolean;
  }[];
  confidence: {
    distribution: Record<string, number>;
    average_score: number;
    median_score: number;
  };
}

function loadIntelligence(batchId: string): DashboardIntelligence | null {
  const path = join(batchDataRoot(batchId), "dashboard_intelligence.json");
  if (!existsSync(path)) return null;
  return readJson<DashboardIntelligence>(path);
}

/** Scans uploaded/manual_review/failed for which article lives where, and what files it has. */
function scanArticleLocations(batchId: string): Map<string, ArticleLocation> {
  const locations = new Map<string, ArticleLocation>();
  const packagesRoot = batchPackagesRoot(batchId);
  for (const category of CATEGORIES) {
    const categoryDir = join(packagesRoot, category);
    if (!existsSync(categoryDir) || !statSync(categoryDir).isDirectory()) continue;
    for (const articleId of readdirSync(categoryDir)) {
      if (articleId.startsWith(".")) continue;
      const articleDir = join(categoryDir, articleId);
      if (!existsSync(articleDir) || !statSync(articleDir).isDirectory()) continue;
      const files = readdirSync(articleDir);
      const zipFile = files.find((f) => f.endsWith(".zip")) ?? null;
      const certFile = files.find((f) => f.endsWith("_Certification_Report.html")) ?? null;
      const validationFile = files.find((f) => f.endsWith("_Validation_Report.html")) ?? null;
      const migrationAuditFile = files.find((f) => f.endsWith("_Migration_Audit_Report.html")) ?? null;
      const migrationAuditJson = files.find((f) => f === "migration-audit.json") ?? null;
      locations.set(articleId, {
        category,
        zipFile: zipFile ? join(articleDir, zipFile) : null,
        certificationHtmlFile: certFile ? join(articleDir, certFile) : null,
        validationHtmlFile: validationFile ? join(articleDir, validationFile) : null,
        migrationAuditHtmlFile: migrationAuditFile ? join(articleDir, migrationAuditFile) : null,
        migrationAuditJsonFile: migrationAuditJson ? join(articleDir, migrationAuditJson) : null,
      });
    }
  }
  return locations;
}

export function getSummary(batchId: string): SummaryStats {
  const reports = loadConversionReports(batchId);
  const locations = scanArticleLocations(batchId);
  const status_counts: Record<string, number> = {};
  const confidence_distribution: Record<string, number> = {};
  const category_counts: Record<OutputCategory, number> = {
    uploaded: 0,
    manual_review: 0,
    failed: 0,
  };
  const validation_counts: Record<ValidationResultValue, number> = { pass: 0, warning: 0, error: 0 };
  const dtd_counts = newDtdCounts();
  const spec_alignment_counts: Partial<Record<SpecAlignmentCategory, number>> = {};
  let engine_defects_fixed_count = 0;

  for (const report of reports.values()) {
    status_counts[report.status] = (status_counts[report.status] ?? 0) + 1;
    confidence_distribution[report.overall_confidence] =
      (confidence_distribution[report.overall_confidence] ?? 0) + 1;
    const location = locations.get(report.article_id);
    if (location) category_counts[location.category] += 1;
    if (report.validation_report) {
      validation_counts[report.validation_report.overall_result] += 1;
      dtd_counts[report.validation_report.overall_dtd_result ?? "not_checked"] += 1;
    }
    addSpecAlignmentCounts(spec_alignment_counts, report);
    engine_defects_fixed_count += countEngineDefectsFixed(report);
  }

  return {
    total_articles: reports.size,
    status_counts,
    confidence_distribution,
    category_counts,
    validation_counts,
    dtd_counts,
    spec_alignment_counts,
    engine_defects_fixed_count,
  };
}

export function getBatchSummaryStats(
  batchId: string,
): Omit<BatchSummary, "batch_id" | "created_at"> {
  const summary = getSummary(batchId);
  const sc = summary.status_counts;
  return {
    total: summary.total_articles,
    success: (sc.certified ?? 0) + (sc.certified_with_warnings ?? 0),
    recovery: sc.certified_with_recovery ?? 0,
    manual_review: sc.partial_certification ?? 0,
    failed: (sc.engine_failure ?? 0) + (sc.fatal_failure ?? 0),
    duration_seconds: getBatchDuration(batchId),
  };
}

export function listJournals(batchId: string): JournalStats[] {
  const intelligence = loadIntelligence(batchId);
  if (!intelligence) return [];
  const reports = loadConversionReports(batchId);

  return Object.values(intelligence.journals).map((j) => {
    const journalReports = [...reports.values()].filter((r) => r.journal === j.journal);
    const withRecovery = journalReports.filter((r) => r.recoveries.length > 0).length;
    const totalWarnings = journalReports.reduce((sum, r) => sum + r.warnings.length, 0);
    const commonRecovery = Object.entries(j.recovery_rule_counts).sort((a, b) => b[1] - a[1])[0];

    // Mirrors dashboard_intelligence.json's own broader "warnings" concept
    // (used by the corpus-wide Warning Analytics table), which pools both
    // ConversionReport.warnings and .recoveries — in this engine, an
    // advisory finding the engine actually acted on is still something
    // worth an operator's attention, same as a pure warning.
    const warningCounts = new Map<string, number>();
    for (const report of journalReports) {
      for (const finding of [...report.warnings, ...report.recoveries]) {
        warningCounts.set(finding.code, (warningCounts.get(finding.code) ?? 0) + 1);
      }
    }
    const commonWarning = [...warningCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      journal: j.journal,
      article_count: j.article_count,
      status_counts: j.status_counts,
      average_confidence_score: j.average_confidence_score,
      recovery_rule_counts: j.recovery_rule_counts,
      business_rule_failure_counts: j.business_rule_failure_counts,
      recovery_rate: j.article_count === 0 ? 0 : withRecovery / j.article_count,
      common_recovery_rule: commonRecovery ? commonRecovery[0] : null,
      most_common_warning: commonWarning ? commonWarning[0] : null,
      total_warnings: totalWarnings,
    };
  });
}

export function listArticles(batchId: string): ArticleSummary[] {
  const reports = loadConversionReports(batchId);
  const locations = scanArticleLocations(batchId);

  return [...reports.values()].map((r) => ({
    article_id: r.article_id,
    journal: r.journal,
    status: r.status,
    confidence_score: r.confidence_score,
    overall_confidence: r.overall_confidence,
    warning_count: r.warnings.length + r.generator_findings.length,
    recovery_count: r.recoveries.length,
    category: locations.get(r.article_id)?.category ?? "failed",
  }));
}

export function getArticle(batchId: string, articleId: string): ArticleDetail | null {
  const reports = loadConversionReports(batchId);
  const report = reports.get(articleId);
  if (!report) return null;
  const location = scanArticleLocations(batchId).get(articleId);

  return {
    ...report,
    warning_count: report.warnings.length + report.generator_findings.length,
    recovery_count: report.recoveries.length,
    category: location?.category ?? "failed",
    has_zip: location?.zipFile != null,
    has_certification_report: location?.certificationHtmlFile != null,
    has_validation_report: location?.validationHtmlFile != null,
    has_migration_audit_report: location?.migrationAuditHtmlFile != null,
    package_size_bytes: location?.zipFile ? statSync(location.zipFile).size : null,
  };
}

export function getArticleFile(
  batchId: string,
  articleId: string,
  kind: "zip" | "certification" | "validation" | "migration-audit-html" | "migration-audit-json",
): string | null {
  const location = scanArticleLocations(batchId).get(articleId);
  if (!location) return null;
  if (kind === "zip") return location.zipFile;
  if (kind === "certification") return location.certificationHtmlFile;
  if (kind === "validation") return location.validationHtmlFile;
  if (kind === "migration-audit-html") return location.migrationAuditHtmlFile;
  return location.migrationAuditJsonFile;
}

export function listManualReview(batchId: string): ManualReviewEntry[] {
  const reports = loadConversionReports(batchId);
  const locations = scanArticleLocations(batchId);

  const entries: ManualReviewEntry[] = [];
  for (const [articleId, location] of locations) {
    if (location.category !== "manual_review") continue;
    const report = reports.get(articleId);
    if (!report) continue;
    entries.push({
      article_id: articleId,
      journal: report.journal,
      reason: describeReason(report),
      confidence_score: report.confidence_score,
    });
  }
  return entries;
}

function describeReason(report: ConversionReportRecord): string {
  if (report.missing_files.length > 0) {
    return `Missing ${report.missing_files.length} file(s): ${report.missing_files[0]}`;
  }
  if (report.business_rules_failed.length > 0) {
    return `Business rule finding: ${report.business_rules_failed.join(", ")}`;
  }
  return "Partial certification";
}

export function listFailedArticleIds(batchId: string): string[] {
  const locations = scanArticleLocations(batchId);
  return [...locations.entries()]
    .filter(([, location]) => location.category === "failed")
    .map(([articleId]) => articleId);
}

export function listManualReviewArticleIds(batchId: string): string[] {
  const locations = scanArticleLocations(batchId);
  return [...locations.entries()]
    .filter(([, location]) => location.category === "manual_review")
    .map(([articleId]) => articleId);
}

export function getRecoveryRuleStats(batchId: string): RecoveryRuleStats[] {
  const intelligence = loadIntelligence(batchId);
  if (!intelligence) return [];
  return Object.values(intelligence.recovery_rules).sort((a, b) => b.occurrences - a.occurrences);
}

export function getTopMissingFiles(batchId: string, limit = 10): { file: string; occurrences: number }[] {
  const reports = loadConversionReports(batchId);
  const counts = new Map<string, number>();
  for (const report of reports.values()) {
    for (const file of report.missing_files) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([file, occurrences]) => ({ file, occurrences }));
}

export function getBusinessRuleStats(batchId: string): BusinessRuleStats[] {
  const intelligence = loadIntelligence(batchId);
  if (!intelligence) return [];
  return Object.values(intelligence.business_rules)
    .filter((r) => r.total_triggered > 0)
    .sort((a, b) => b.total_triggered - a.total_triggered);
}

export function getWarningStats(batchId: string): WarningStats[] {
  const intelligence = loadIntelligence(batchId);
  if (!intelligence) return [];
  return [...intelligence.warnings].sort((a, b) => b.occurrences - a.occurrences);
}

export function getConfidenceDistribution(batchId: string): DashboardIntelligence["confidence"] | null {
  const intelligence = loadIntelligence(batchId);
  return intelligence?.confidence ?? null;
}

export function getConversionReportJson(
  batchId: string,
  articleId: string,
): ConversionReportRecord | null {
  return loadConversionReports(batchId).get(articleId) ?? null;
}

export function getMigrationAuditJson(batchId: string, articleId: string): unknown | null {
  const path = getArticleFile(batchId, articleId, "migration-audit-json");
  if (!path) return null;
  return readJson<unknown>(path);
}

export function getValidationStats(batchId: string): ValidationStats {
  const reports = loadConversionReports(batchId);
  const overall_counts: Record<ValidationResultValue, number> = { pass: 0, warning: 0, error: 0 };
  const dtd_counts = newDtdCounts();
  const issueCounts = new Map<string, number>();
  const spec_alignment_counts: Partial<Record<SpecAlignmentCategory, number>> = {};
  let total_errors = 0;
  let total_warnings = 0;
  let dtd_not_vendored_count = 0;
  let engine_defects_fixed_count = 0;

  for (const report of reports.values()) {
    engine_defects_fixed_count += countEngineDefectsFixed(report);
    const validation = report.validation_report;
    if (!validation) continue;
    overall_counts[validation.overall_result] += 1;
    dtd_counts[validation.overall_dtd_result ?? "not_checked"] += 1;
    total_errors += validation.total_errors;
    total_warnings += validation.total_warnings;
    addSpecAlignmentCounts(spec_alignment_counts, report);
    for (const file of validation.files) {
      if (!file.dtd_available) dtd_not_vendored_count += 1;
      for (const issue of file.issues) {
        issueCounts.set(issue.message, (issueCounts.get(issue.message) ?? 0) + 1);
      }
    }
  }

  const common_issues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([message, occurrences]) => ({ message, occurrences }));

  return {
    overall_counts,
    dtd_counts,
    total_errors,
    total_warnings,
    dtd_not_vendored_count,
    common_issues,
    spec_alignment_counts,
    engine_defects_fixed_count,
  };
}
