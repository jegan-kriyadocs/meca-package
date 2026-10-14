import { prisma, isDatabaseEnabled } from "../prisma.js";

/**
 * ==============================================================================
 * LOG DATABASE SERVICE
 * ==============================================================================
 * Handles saving and retrieving engine/system logs.
 * Only executes if DATABASE_URL is configured.
 */

export interface CreateLogInput {
  batchId: string;
  level?: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
}

export const logService = {
  /**
   * Appends a single log entry for a batch.
   */
  async createLog(input: CreateLogInput) {
    if (!isDatabaseEnabled || !prisma) return null;
    try {
      return await prisma.batchLog.create({
        data: {
          batchId: input.batchId,
          level: input.level ?? "INFO",
          message: input.message,
        },
      });
    } catch (err) {
      console.error(`[DB:LogService] Failed to insert log for batch ${input.batchId}:`, err);
      return null;
    }
  },

  /**
   * Batch inserts multiple log lines efficiently.
   */
  async createManyLogs(logs: CreateLogInput[]) {
    if (!isDatabaseEnabled || !prisma || logs.length === 0) return { count: 0 };
    try {
      return await prisma.batchLog.createMany({
        data: logs.map((l) => ({
          batchId: l.batchId,
          level: l.level ?? "INFO",
          message: l.message,
        })),
      });
    } catch (err) {
      console.error("[DB:LogService] Failed to batch insert logs:", err);
      return { count: 0 };
    }
  },

  /**
   * Retrieves the most recent logs for a specific batch.
   */
  async getLogsByBatchId(batchId: string, limit = 500) {
    if (!isDatabaseEnabled || !prisma) return [];
    try {
      const logs = await prisma.batchLog.findMany({
        where: { batchId },
        orderBy: { id: "asc" },
        take: limit,
      });
      return logs;
    } catch (err) {
      console.error(`[DB:LogService] Failed to fetch logs for batch ${batchId}:`, err);
      return [];
    }
  },
};
