import { prisma, isDatabaseEnabled } from "../prisma.js";

/**
 * ==============================================================================
 * MANUAL REVIEW DATABASE SERVICE
 * ==============================================================================
 * Handles operator review notes and status updates (pending, approved, rejected).
 * Only executes if DATABASE_URL is configured.
 */

export interface UpsertReviewInput {
  batchId: string;
  articleId: string;
  note?: string;
  status?: string; // "pending" | "approved" | "rejected"
  reviewer?: string;
}

export const reviewService = {
  /**
   * Saves or updates an operator review note for a given article in a batch.
   */
  async upsertReview(input: UpsertReviewInput) {
    if (!isDatabaseEnabled || !prisma) return null;
    try {
      return await prisma.manualReview.upsert({
        where: {
          batchId_articleId: {
            batchId: input.batchId,
            articleId: input.articleId,
          },
        },
        create: {
          batchId: input.batchId,
          articleId: input.articleId,
          note: input.note ?? "",
          status: input.status ?? "pending",
          reviewer: input.reviewer,
        },
        update: {
          ...(input.note !== undefined && { note: input.note }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.reviewer !== undefined && { reviewer: input.reviewer }),
        },
      });
    } catch (err) {
      console.error(`[DB:ReviewService] Failed to upsert review for ${input.articleId}:`, err);
      return null;
    }
  },

  /**
   * Retrieves all reviews and notes for a specific batch.
   */
  async getReviewsByBatchId(batchId: string) {
    if (!isDatabaseEnabled || !prisma) return [];
    try {
      return await prisma.manualReview.findMany({
        where: { batchId },
      });
    } catch (err) {
      console.error(`[DB:ReviewService] Failed to fetch reviews for batch ${batchId}:`, err);
      return [];
    }
  },
};
