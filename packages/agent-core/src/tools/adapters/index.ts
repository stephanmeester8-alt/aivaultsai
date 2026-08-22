import { createToolAdapterRegistry } from "../../execution/adapters.ts";
import { FilesystemAdapter } from "./filesystem-adapter.ts";
import { HttpAdapter } from "./http-adapter.ts";

export { FilesystemAdapter } from "./filesystem-adapter.ts";
export { HttpAdapter } from "./http-adapter.ts";

export type SafeAdapterRegistryOptions = {
  readonly filesystemRoot?: string;
  readonly allowFilesystemWrite?: boolean;
  readonly enableHttp?: boolean;
};

/**
 * Production-safe adapter registry. By default NOTHING is registered: every
 * tool is explicitly unavailable. An operator must opt in per tool:
 * - filesystem: requires an explicit root; writes disabled unless enabled.
 * - http: read-only, SSRF-guarded; opt-in.
 * browser / terminal / mcp have no adapters and remain unavailable.
 */
export function createSafeAdapterRegistry(
  options: SafeAdapterRegistryOptions = {},
): ReturnType<typeof createToolAdapterRegistry> {
  const registry = createToolAdapterRegistry();
  if (options.filesystemRoot) {
    registry.register(
      new FilesystemAdapter({
        root: options.filesystemRoot,
        allowWrite: options.allowFilesystemWrite === true,
      }),
    );
  }
  if (options.enableHttp === true) {
    registry.register(new HttpAdapter());
  }
  return registry;
}
