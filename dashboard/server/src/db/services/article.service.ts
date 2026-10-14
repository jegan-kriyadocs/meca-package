import { prisma, isDatabaseEnabled } from "../prisma.js";

/**
 * ==============================================================================
 * ARTICLE DATABASE SERVICE
 * ==============================================================================
 * Handles storing and querying processed article metrics.
 * Only executes if DATABASE_URL is configured.
 */

export interface ArticleRecordInput {
  id: string;
  batchId: string;
  journalCode?: string | null;
  status: "uploaded" | "manual_review" | "failed";
  confidenceScore?: number | null;
  warningsCount?: number;
  errorsCount?: number;
  validationStatus?: string | null;
}

export const articleService = {
  /**
   * Upserts multiple article records for a batch.
   */
  async syncArticles(articles: ArticleRecordInput[]) {
    if (!isDatabaseEnabled || !prisma || articles.length === 0) return { count: 0 };
    const db = prisma;
    try {
      // Use transaction to ensure all articles are updated reliably
      const results = await db.$transaction(
        articles.map((art) =>
          db.article.upsert({
            where: { id: art.id },
            create: {
              id: art.id,
              batchId: art.batchId,
              journalCode: art.journalCode,
              status: art.status,
              confidenceScore: art.confidenceScore,
              warningsCount: art.warningsCount ?? 0,
              errorsCount: art.errorsCount ?? 0,
              validationStatus: art.validationStatus,
            },
            update: {
              batchId: art.batchId,
              journalCode: art.journalCode,
              status: art.status,
              confidenceScore: art.confidenceScore,
              warningsCount: art.warningsCount ?? 0,
              errorsCount: art.errorsCount ?? 0,
              validationStatus: art.validationStatus,
            },
          }),
        ),
      );
      return { count: results.length };
    } catch (err) {
      console.error("[DB:ArticleService] Failed to sync articles:", err);
      return { count: 0 };
    }
  },

  /**
   * Retrieves all articles for a batch.
   */
  async getArticlesByBatchId(batchId: string) {
    if (!isDatabaseEnabled || !prisma) return [];
    try {
      return await prisma.article.findMany({
        where: { batchId },
        orderBy: { id: "asc" },
      });
    } catch (err) {
      console.error(`[DB:ArticleService] Failed to get articles for batch ${batchId}:`, err);
      return [];
    }
  },
};
