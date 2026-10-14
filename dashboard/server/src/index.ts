import express from "express";
import cors from "cors";
import { router } from "./routes.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { checkDatabaseConnection, isDatabaseEnabled, ensureDatabaseSchema } from "./db/index.js";
import { REPO_ROOT } from "./paths.js";

// Load root .env if present (supports single unified .env for DevOps and local dev)
const rootEnvPath = join(REPO_ROOT, ".env");
if (existsSync(rootEnvPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(rootEnvPath);
  } catch (err) {
    console.warn("Could not load root .env file:", err);
  }
}

// Fallback: also load local dashboard/server/.env if it exists
const localServerEnvPath = join(REPO_ROOT, "dashboard/server/.env");
if (existsSync(localServerEnvPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(localServerEnvPath);
  } catch {
    // ignore
  }
}


const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Security: Hide Express framework signature
app.disable("x-powered-by");

// Allow Cross-Origin Requests
app.use(cors());

// Body parser with sensible size limits (prevents payload flood attacks)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Main API routes
app.use("/api", router);

const candidates = [
  join(process.cwd(), "../web/dist"),
  join(process.cwd(), "../../web/dist"),
  "/app/dashboard/web/dist",
];

const webDistPath = candidates.find((p) => existsSync(p)) ?? null;
if (webDistPath) {
  console.log(`Serving static web assets from ${webDistPath}`);
  app.use(express.static(webDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(join(webDistPath, "index.html"));
  });
} else {
  console.log("No web/dist found, running API-only mode");
}


app.listen(PORT, async () => {
  console.log(`Dashboard API listening on http://localhost:${PORT}`);
  if (isDatabaseEnabled) {
    const dbHealth = await checkDatabaseConnection();
    if (dbHealth.ok) {
      console.log("PostgreSQL Database connected successfully");
      await ensureDatabaseSchema();
    } else {
      console.warn("PostgreSQL Database not reachable (running in file-based fallback):", dbHealth.error);
    }
  } else {
    console.log("Database not configured (DATABASE_URL not set) — running in file-based mode");
  }
});
