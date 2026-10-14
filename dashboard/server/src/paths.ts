import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** <repo> — three levels up from dashboard/server/src/ or dashboard/server/dist/. */
export const REPO_ROOT = join(__dirname, "../../../");

/** <repo>/meca-engine */
export const MECA_ENGINE_ROOT = join(REPO_ROOT, "meca-engine");

/** <repo>/archive_migration_validation, overridable for local experimentation. */
export const DATA_ROOT =
  process.env.DASHBOARD_DATA_ROOT ?? join(__dirname, "../../../archive_migration_validation");

import { existsSync } from "node:fs";

export const BATCHES_ROOT = join(DATA_ROOT, "batches");

/**
 * Resolves the python binary:
 * 1. process.env.DASHBOARD_PYTHON_BIN if set
 * 2. Local <repo>/meca-engine/.venv/bin/python3 if virtual environment exists
 * 3. System 'python3' (used in Docker / Production Cloud)
 */
export function getPythonBin(): string {
  if (process.env.DASHBOARD_PYTHON_BIN) {
    return process.env.DASHBOARD_PYTHON_BIN;
  }
  const isWindows = process.platform === "win32";
  const venvPython = isWindows
    ? join(MECA_ENGINE_ROOT, ".venv", "Scripts", "python.exe")
    : join(MECA_ENGINE_ROOT, ".venv", "bin", "python3");
  if (existsSync(venvPython)) {
    return venvPython;
  }
  return "python3";
}

/**
 * Resolves extra PYTHONPATH:
 * 1. process.env.DASHBOARD_PYTHONPATH_EXTRA if set
 * 2. <repo>/meca-engine/src by default
 */
export function getPythonPathExtra(): string {
  return process.env.DASHBOARD_PYTHONPATH_EXTRA ?? join(MECA_ENGINE_ROOT, "src");
}
