export function copyReversalPlan(original, reversal, pieces) {
  if (
    !original ||
    reversal.reversal_of_log_id !== original.id ||
    original.material_id !== reversal.material_id ||
    original.stock_scope_id !== reversal.stock_scope_id ||
    !["IN", "OUT"].includes(reversal.direction) ||
    original.direction === reversal.direction ||
    original.change_qty !== reversal.change_qty ||
    pieces.some((piece) => piece.direction !== original.direction)
  ) {
    throw new Error(`Invalid reversal evidence for log ${reversal.id}`);
  }
  return pieces.map((piece) => ({ ...piece, direction: reversal.direction }));
}

export function assertPlanDirections(logsById, plans) {
  for (const [id, pieces] of plans) {
    const log = logsById.get(id);
    if (!log || pieces.some((piece) => piece.direction !== log.direction)) {
      throw new Error(`Allocation direction mismatch for log ${id}`);
    }
  }
}
