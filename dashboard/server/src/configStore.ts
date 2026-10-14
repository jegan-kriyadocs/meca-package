import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { load as parseYaml } from "js-yaml";
import { MECA_ENGINE_ROOT, getPythonBin, getPythonPathExtra } from "./paths.js";

const PYTHON_BIN = getPythonBin();
const PYTHON_PATH_EXTRA = getPythonPathExtra();

const RUNTIME_CONFIG_PATH = join(MECA_ENGINE_ROOT, "config", "runtime.yaml");

export function readRuntimeConfig(): Record<string, unknown> {
  const text = readFileSync(RUNTIME_CONFIG_PATH, "utf-8");
  return parseYaml(text) as Record<string, unknown>;
}

/**
 * Applies a partial update to runtime.yaml by delegating to
 * scripts/update_runtime_config.py, which merges + validates against the
 * existing JSON Schema and rolls back on failure — no validation logic
 * duplicated here.
 */
export function updateRuntimeConfig(updates: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const pythonPath = [PYTHON_PATH_EXTRA, join(MECA_ENGINE_ROOT, "src")].filter(Boolean).join(":");
    const child = spawn(PYTHON_BIN, ["scripts/update_runtime_config.py"], {
      cwd: MECA_ENGINE_ROOT,
      env: { ...process.env, PYTHONPATH: pythonPath },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

    child.on("close", (code) => {
      if (code === 0) {
        resolve(JSON.parse(stdout) as Record<string, unknown>);
      } else {
        reject(new Error(stderr.trim() || "Configuration update failed"));
      }
    });

    child.stdin.write(JSON.stringify(updates));
    child.stdin.end();
  });
}
