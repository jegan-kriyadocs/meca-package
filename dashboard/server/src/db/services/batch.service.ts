import { prisma, isDatabaseEnabled } from "../prisma.js";

/**
 * ==============================================================================
 * BATCH DATABASE SERVICE
 * ==============================================================================
 * Handles all database operations related to migration batches.
 * Only executes if DATABASE_URL is configured.
 */

export interface CreateBatchInput {
  id: string;
  totalArticles?: number;
}

export interface UpdateBatchProgressInput {
  uploadedCount?: number;
  manualReviewCount?: number;
  failedCount?: number;
  totalArticles?: number;
}

export interface CompleteBatchInput {
  status: "completed" | "failed" | "cancelled";
  uploadedCount?: number;
  manualReviewCount?: number;
  failedCount?: number;
  elapsedSeconds?: number;
}

export const batchService = {
  /**
   * Records the start of a new migration batch.
   */
  async createBatch(input: CreateBatchInput) {
    if (!isDatabaseEnabled || !prisma) return null;
    try {
      return await prisma.batch.create({
        data: {
          id: input.id,
          status: "running",
          totalArticles: input.totalArticles ?? 0,
        },
      });
    } catch (err) {
      console.error(`[DB:BatchService] Failed to create batch ${input.id}:`, err);
      return null;
    }
  },

  /**
   * Updates live counter progress during a run.
   */
  async updateProgress(batchId: string, input: UpdateBatchProgressInput) {
    if (!isDatabaseEnabled || !prisma) return null;
    try {
      return await prisma.batch.update({
        where: { id: batchId },
        data: {
          ...(input.uploadedCount !== undefined && { uploadedCount: input.uploadedCount }),
          ...(input.manualReviewCount !== undefined && { manualReviewCount: input.manualReviewCount }),
          ...(input.failedCount !== undefined && { failedCount: input.failedCount }),
          ...(input.totalArticles !== undefined && { totalArticles: input.totalArticles }),
        },
      });
    } catch (err) {
      console.error(`[DB:BatchService] Failed to update progress for ${batchId}:`, err);
      return null;
    }
  },

  /**
   * Marks a batch as finished (completed, failed, or cancelled) with final metrics.
   */
  async completeBatch(batchId: string, input: CompleteBatchInput) {
    if (!isDatabaseEnabled || !prisma) return null;
    try {
      return await prisma.batch.update({
        where: { id: batchId },
        data: {
          status: input.status,
          completedAt: new Date(),
          ...(input.uploadedCount !== undefined && { uploadedCount: input.uploadedCount }),
          ...(input.manualReviewCount !== undefined && { manualReviewCount: input.manualReviewCount }),
          ...(input.failedCount !== undefined && { failedCount: input.failedCount }),
          ...(input.elapsedSeconds !== undefined && { elapsedSeconds: input.elapsedSeconds }),
        },
      });
    } catch (err) {
      console.error(`[DB:BatchService] Failed to complete batch ${batchId}:`, err);
      return null;
    }
  },

  /**
   * Gets a batch record by its unique ID.
   */
  async getBatchById(batchId: string) {
    if (!isDatabaseEnabled || !prisma) return null;
    try {
      return await prisma.batch.findUnique({
        where: { id: batchId },
        include: {
          _count: {
            select: {
              articles: true,
              logs: true,
              manualReviews: true,
            },
          },
        },
      });
    } catch (err) {
      console.error(`[DB:BatchService] Failed to get batch ${batchId}:`, err);
      return null;
    }
  },

  /**
   * Lists the most recent batches.
   */
  async listBatches(limit = 50) {
    if (!isDatabaseEnabled || !prisma) return [];
    try {
      return await prisma.batch.findMany({
        orderBy: { startedAt: "desc" },
        take: limit,
      });
    } catch (err) {
      console.error("[DB:BatchService] Failed to list batches:", err);
      return [];
    }
  },
};
