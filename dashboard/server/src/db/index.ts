/**
 * ==============================================================================
 * DATABASE MODULE BARREL EXPORT
 * ==============================================================================
 * Central access point for all database operations.
 * Allows importing any service like:
 * import { prisma, batchService, logService, ... } from "./db/index.js";
 */

export { prisma, checkDatabaseConnection, isDatabaseEnabled, ensureDatabaseSchema } from "./prisma.js";
export { batchService } from "./services/batch.service.js";
export { articleService } from "./services/article.service.js";
export { reviewService } from "./services/review.service.js";
export { logService } from "./services/log.service.js";
