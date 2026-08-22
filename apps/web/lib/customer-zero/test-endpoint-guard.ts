/**
 * Test-endpoint guard (TASK 25 — security hardening).
 *
 * Public debug/test routes must never be reachable in a production
 * deployment. The guard allows them only in local development
 * (NODE_ENV === "development"); everywhere else they answer 404.
 *
 * Decision (documented):
 * - /api/customer-zero/test-lead       -> development/test ONLY (this guard).
 * - /api/customer-zero/test-orchestrator -> REMOVED from the build (broken,
 *   untracked test route).
 */

export function isTestEndpointEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}
