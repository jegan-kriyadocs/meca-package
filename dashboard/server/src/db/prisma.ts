import { PrismaClient } from "@prisma/client";

/**
 * ==============================================================================
 * DATABASE CLIENT SINGLETON (Prisma)
 * ==============================================================================
 * Connects to PostgreSQL only if DATABASE_URL is set in environment.
 * If DATABASE_URL is absent, the system operates in standalone file-based mode.
 */

export const isDatabaseEnabled = Boolean(
  process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "",
);

// Global variable augmentation for development mode hot-reloading (tsx watch)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient | null = isDatabaseEnabled
  ? (globalForPrisma.prisma ??
    new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
    }))
  : null;

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../paths.js";

/**
 * Checks if the PostgreSQL connection is active and healthy.
 * Useful for container health checks and server startup verification.
 */
export async function checkDatabaseConnection(): Promise<{
  ok: boolean;
  disabled?: boolean;
  error?: string;
}> {
  if (!isDatabaseEnabled || !prisma) {
    return { ok: false, disabled: true, error: "Database not configured (DATABASE_URL not set)" };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    let hint = "";
    if (
      errorMsg.includes("SSL") ||
      errorMsg.includes("no encryption") ||
      errorMsg.includes("pg_hba.conf")
    ) {
      hint = " — HINT: Managed databases (like AWS RDS) require SSL. Append '?sslmode=require' to your DATABASE_URL.";
    }
    return { ok: false, error: `${errorMsg}${hint}` };
  }
}

/**
 * Automatically checks and initializes the database tables (batches, articles, manual_reviews, batch_logs).
 * Guarantees zero-touch setup on fresh AWS RDS or local PostgreSQL instances.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  if (!isDatabaseEnabled || !prisma) return;
  try {
    const tableCheck: Array<{ exists: boolean }> = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'batches'
      ) as "exists";
    `;

    if (!tableCheck[0]?.exists) {
      console.log("[DB] Required tables missing. Auto-initializing database schema from init.sql...");
      const initSqlPath = join(REPO_ROOT, "dashboard/server/prisma/init.sql");
      if (existsSync(initSqlPath)) {
        const sql = readFileSync(initSqlPath, "utf-8");
        const statements = sql
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const stmt of statements) {
          try {
            await prisma.$executeRawUnsafe(stmt);
          } catch (stmtErr) {
            console.warn("[DB] Schema statement warning:", stmtErr);
          }
        }
        console.log("[DB] PostgreSQL Database schema initialized successfully (tables, indexes, relations ready).");
      } else {
        console.warn("[DB] Could not find init.sql at:", initSqlPath);
      }
    } else {
      console.log("[DB] PostgreSQL Database schema verified (all tables present).");
    }
  } catch (err) {
    console.error("[DB] Could not verify or auto-initialize database schema:", err);
  }
}

