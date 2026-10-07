import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MECA_ENGINE_ROOT, BATCHES_ROOT } from "./paths.js";

// Portable by default (relies on `python3` already having the engine's
// dependencies installed, same requirement as running the script by hand).
// Override for environments where that isn't already true.
const PYTHON_BIN = process.env.DASHBOARD_PYTHON_BIN ?? "python3";
const PYTHON_PATH_EXTRA = process.env.DASHBOARD_PYTHONPATH_EXTRA ?? "";

export type RunPhase = "idle" | "starting" | "running" | "exited";
export type ControlCommand = "run" | "pause" | "stop_after_current" | "cancel";

export interface LiveStatus {
  state: "processing" | "completed" | "stopped" | "cancelled";
  total: number;
  completed: number;
  remaining: number;
  current_article_id: string | null;
  started_at: string;
  elapsed_seconds: number;
  estimated_remaining_seconds: number | null;
  articles_per_second: number | null;
}

export interface RunControllerState {
  phase: RunPhase;
  batchId: string | null;
  exitCode: number | null;
  paused: boolean;
}

const LOG_BUFFER_LIMIT = 2000;

function newBatchId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export interface StartRunOptions {
  articleIds?: string[];
  limit?: number;
  offset?: number;
  inputFormat?: "directory" | "zip";
}

export interface InputSummary {
  provider: "LOCAL" | "S3" | string;
  path: string;
  total: number;
  articles: string[];
  error: string | null;
}

export function getInputSummary(format: string = "directory"): Promise<InputSummary> {
  return new Promise((resolve) => {
    const pythonPath = [PYTHON_PATH_EXTRA, join(MECA_ENGINE_ROOT, "src")].filter(Boolean).join(":");
    const args = ["scripts/list_input_articles.py", "--input-format", format || "directory"];
    const child = spawn(PYTHON_BIN, args, {
      cwd: MECA_ENGINE_ROOT,
      env: { ...process.env, PYTHONPATH: pythonPath },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

    child.on("close", (code) => {
      try {
        if (code === 0 && stdout.trim()) {
          resolve(JSON.parse(stdout.trim()) as InputSummary);
        } else {
          resolve({
            provider: "UNKNOWN",
            path: "",
            total: 0,
            articles: [],
            error: stderr.trim() || `Script exited with code ${code}`,
          });
        }
      } catch (err) {
        resolve({
          provider: "UNKNOWN",
          path: "",
          total: 0,
          articles: [],
          error: String(err),
        });
      }
    });
  });
}

class RunController {
  private child: ChildProcess | null = null;
  private phase: RunPhase = "idle";
  private batchId: string | null = null;
  private exitCode: number | null = null;
  private paused = false;
  private cancelled = false;
  private logBuffer: string[] = [];

  getState(): RunControllerState {
    return { phase: this.phase, batchId: this.batchId, exitCode: this.exitCode, paused: this.paused };
  }

  getLogs(): string[] {
    return this.logBuffer;
  }

  getLiveStatus(): LiveStatus | null {
    if (!this.batchId) return null;
    const path = join(BATCHES_ROOT, this.batchId, "live_status.json");
    if (!existsSync(path)) return null;
    const status = JSON.parse(readFileSync(path, "utf-8")) as LiveStatus;
    // A cancel is a hard kill: the file may still say "processing" if the
    // child died before it could write its own terminal state.
    if (this.cancelled && this.phase === "exited" && status.state === "processing") {
      return { ...status, state: "cancelled", current_article_id: null };
    }
    return status;
  }

  start(optionsOrArticleIds?: string[] | StartRunOptions): { batchId: string } {
    if (this.phase === "starting" || this.phase === "running") {
      throw new Error("A migration is already running");
    }

    const options: StartRunOptions = Array.isArray(optionsOrArticleIds)
      ? { articleIds: optionsOrArticleIds }
      : optionsOrArticleIds ?? {};

    const { articleIds, limit, offset, inputFormat } = options;

    const batchId = newBatchId();
    const batchDir = join(BATCHES_ROOT, batchId);
    mkdirSync(batchDir, { recursive: true });

    const args = ["scripts/archive_migration_batch.py", "--batch-id", batchId];
    if (articleIds && articleIds.length > 0) {
      args.push("--article-ids", articleIds.join(","));
    }
    if (limit !== undefined && limit !== null && Number(limit) > 0) {
      args.push("--limit", String(limit));
    }
    if (offset !== undefined && offset !== null && Number(offset) > 0) {
      args.push("--offset", String(offset));
    }
    if (inputFormat) {
      args.push("--input-format", inputFormat);
    }

    const pythonPath = [PYTHON_PATH_EXTRA, join(MECA_ENGINE_ROOT, "src")]
      .filter(Boolean)
      .join(":");

    const child = spawn(PYTHON_BIN, args, {
      cwd: MECA_ENGINE_ROOT,
      env: { ...process.env, PYTHONPATH: pythonPath },
    });

    this.child = child;
    this.phase = "starting";
    this.batchId = batchId;
    this.exitCode = null;
    this.paused = false;
    this.cancelled = false;
    this.logBuffer = [];
    writeFileSync(join(batchDir, "control.json"), JSON.stringify({ command: "run" }));

    const logStream = createWriteStream(join(batchDir, "service.log"), { flags: "a" });

    child.stdout?.on("data", (chunk: Buffer) => this.captureLog(chunk, logStream));
    child.stderr?.on("data", (chunk: Buffer) => this.captureLog(chunk, logStream));

    child.on("spawn", () => {
      this.phase = "running";
    });
    child.on("exit", (code) => {
      this.phase = "exited";
      this.exitCode = code;
      logStream.end();
    });

    return { batchId };
  }

  private captureLog(chunk: Buffer, logStream: NodeJS.WritableStream): void {
    logStream.write(chunk);
    const lines = chunk.toString("utf-8").split("\n").filter(Boolean);
    this.logBuffer.push(...lines);
    if (this.logBuffer.length > LOG_BUFFER_LIMIT) {
      this.logBuffer = this.logBuffer.slice(-LOG_BUFFER_LIMIT);
    }
  }

  private sendCommand(command: ControlCommand): void {
    if (!this.batchId) {
      throw new Error("No migration is running");
    }
    const controlPath = join(BATCHES_ROOT, this.batchId, "control.json");
    writeFileSync(controlPath, JSON.stringify({ command }));
    this.paused = command === "pause";
  }

  pause(): void {
    this.sendCommand("pause");
  }

  resume(): void {
    this.sendCommand("run");
  }

  stopAfterCurrent(): void {
    this.sendCommand("stop_after_current");
  }

  cancel(): void {
    this.sendCommand("cancel");
    this.cancelled = true;
    this.child?.kill("SIGTERM");
  }
}

export const runController = new RunController();
