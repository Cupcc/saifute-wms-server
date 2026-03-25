import type { ProjectMigrationPlan } from "./types";

/**
 * Build the cutover readiness assessment for the project migration slice.
 *
 * Structural exclusions block cutover by default. Once all excluded projects have
 * been intentionally reviewed and accepted, set the environment variable
 * PROJECT_STRUCTURAL_EXCLUSIONS_ACKNOWLEDGED=true to clear that specific blocker.
 * The acknowledgement is explicit and auditable: it appears in the validate report
 * under cutoverReadiness.structuralExclusionsAcknowledged.
 *
 * Only unsigned (unacknowledged) structural exclusions block cutover; acknowledged
 * exclusions do not. Downstream consumer counts remain visible in the validate
 * report for operator awareness, but rerun-safety enforcement belongs to the
 * execute guard rather than the final cutover readiness gate.
 */
export function buildCutoverReadiness(
  plan: ProjectMigrationPlan,
  downstreamConsumerCounts: Record<string, number>,
  inventoryReplayConfirmed: boolean,
  structuralExclusionsAcknowledged: boolean,
): {
  cutoverReady: boolean;
  cutoverBlockers: string[];
  pendingProjectCount: number;
  pendingLineCount: number;
  structuralExcludedProjectCount: number;
  requiresInventoryReplay: boolean;
  inventoryReplayConfirmed: boolean;
  structuralExclusionsAcknowledged: boolean;
  downstreamConsumerCounts: Record<string, number>;
} {
  const cutoverBlockers: string[] = [];
  const pendingProjectCount = plan.pendingProjects.length;
  const pendingLineCount = plan.pendingProjects.reduce(
    (total, project) => total + project.pendingLineCount,
    0,
  );
  const structuralExcludedProjectCount = plan.excludedProjects.length;
  const migratedProjectCount = plan.migratedProjects.length;
  const requiresInventoryReplay = migratedProjectCount > 0;

  if (pendingProjectCount > 0) {
    cutoverBlockers.push(
      `${pendingProjectCount} project(s) have unresolved material backlog (${pendingLineCount} pending line(s)); must be resolved before cutover.`,
    );
  }

  if (structuralExcludedProjectCount > 0 && !structuralExclusionsAcknowledged) {
    cutoverBlockers.push(
      `${structuralExcludedProjectCount} project(s) are structurally excluded and require explicit acknowledgement before cutover. Set PROJECT_STRUCTURAL_EXCLUSIONS_ACKNOWLEDGED=true to acknowledge once exclusions are accepted.`,
    );
  }

  if (requiresInventoryReplay && !inventoryReplayConfirmed) {
    cutoverBlockers.push(
      `${migratedProjectCount} admitted project(s) require inventory replay and downstream readiness confirmation before cutover. Set PROJECT_INVENTORY_REPLAY_CONFIRMED=true to acknowledge once replay is complete.`,
    );
  }

  return {
    cutoverReady: cutoverBlockers.length === 0,
    cutoverBlockers,
    pendingProjectCount,
    pendingLineCount,
    structuralExcludedProjectCount,
    requiresInventoryReplay,
    inventoryReplayConfirmed,
    structuralExclusionsAcknowledged,
    downstreamConsumerCounts,
  };
}
