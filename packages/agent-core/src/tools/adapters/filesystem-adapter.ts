import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExecutionRequest, ExecutionResult } from "../../execution/types.ts";
import { adapterCrashResult, failedResult, succeededResult } from "../../execution/result.ts";

export type FilesystemAdapterOptions = {
  /** Authorized root directory. Every operation is confined below it. */
  readonly root: string;
  /**
   * Writes are DISABLED by default. Set true only when the operator
   * explicitly authorizes writes inside the root.
   */
  readonly allowWrite?: boolean;
  readonly maxReadBytes?: number;
};

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Real filesystem adapter, confined to an explicit root. Read-only unless
 * `allowWrite` is explicitly enabled by the operator. Path traversal and
 * absolute-path escapes are rejected.
 */
export class FilesystemAdapter {
  readonly id = "filesystem-adapter";
  readonly toolId = "filesystem" as const;

  readonly #root: string;
  readonly #allowWrite: boolean;
  readonly #maxReadBytes: number;

  constructor(options: FilesystemAdapterOptions) {
    if (!options.root || options.root.trim().length === 0) {
      throw new Error("FilesystemAdapter requires a non-empty root");
    }
    this.#root = path.resolve(options.root);
    this.#allowWrite = options.allowWrite === true;
    this.#maxReadBytes = options.maxReadBytes ?? 1024 * 1024;
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    try {
      const capability = String(request.input["capability"] ?? "");
      const args = (request.input["arguments"] ?? {}) as Record<string, unknown>;

      if (capability !== "FILESYSTEM_READ" && capability !== "FILESYSTEM_WRITE") {
        return failedResult(request, `Unsupported capability: ${capability}`, startedAt);
      }
      if (typeof args["path"] !== "string" || args["path"].trim().length === 0) {
        return failedResult(request, "arguments.path is required", startedAt);
      }

      const resolved = path.resolve(this.#root, args["path"]);
      if (!isInsideRoot(this.#root, resolved)) {
        return failedResult(request, "path escapes the authorized root", startedAt);
      }

      if (capability === "FILESYSTEM_READ") {
        const stat = await fs.stat(resolved).catch(() => null);
        if (!stat) {
          return failedResult(request, `path does not exist: ${args["path"]}`, startedAt);
        }
        if (stat.isDirectory()) {
          const entries = await fs.readdir(resolved);
          return succeededResult(
            request,
            { kind: "directory", path: args["path"], entries },
            startedAt,
          );
        }
        const content = await fs.readFile(resolved, "utf8");
        if (Buffer.byteLength(content, "utf8") > this.#maxReadBytes) {
          return failedResult(request, "file exceeds maxReadBytes", startedAt);
        }
        return succeededResult(
          request,
          { kind: "file", path: args["path"], content },
          startedAt,
        );
      }

      // FILESYSTEM_WRITE
      if (!this.#allowWrite) {
        return failedResult(request, "filesystem writes are not authorized", startedAt);
      }
      const content = typeof args["content"] === "string" ? args["content"] : "";
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf8");
      return succeededResult(
        request,
        { kind: "file", path: args["path"], bytesWritten: Buffer.byteLength(content, "utf8") },
        startedAt,
      );
    } catch (error) {
      return adapterCrashResult(request, error, startedAt);
    }
  }
}
