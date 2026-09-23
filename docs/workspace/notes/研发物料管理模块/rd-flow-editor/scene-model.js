// Display-only simulation. The original document is never mutated.
const FlowSceneModel = (() => {
  const zones = [
    { name: '研发办公区', caption: '项目 · BOM · 需求', x: 24, y: 24, color: '#568aaa', floor: '#dce9ed', type: 'office' },
    { name: '需求复核台', caption: '复核提交 · 非审批', x: 292, y: 24, color: '#638f80', floor: '#e0ebe1', type: 'office' },
    { name: '采购办公室', caption: '采购执行 · 进度跟踪', x: 560, y: 24, color: '#967eac', floor: '#e9e3ed', type: 'office' },
    { name: '研发物料区', caption: '项目库存 · 领退料', x: 24, y: 294, color: '#53998b', floor: '#dcebe4', type: 'lab' },
    { name: '主仓交接区', caption: '入库 · 核对 · 调拨', x: 292, y: 294, color: '#c09560', floor: '#eee5d6', type: 'warehouse' },
    { name: '供应商收货区', caption: '分批到货 · 退货', x: 560, y: 294, color: '#939b70', floor: '#e8ebdc', type: 'delivery' },
  ];
  const placements = {
    plan: 0, draft: 0, review: 1, buy: 2, rejected: 2, supplier: 5, main: 4,
    check: 4, transfer: 4, rd: 3, notes: 0, stock: 3, use: 3, ledger: 0,
    count: 3, back: 4, 'vendor-return': 5, rules: 3,
    'role-rd': 0, 'role-cao': 3, 'role-buy': 2, 'role-main': 4,
    'role-admin': 1, 'role-lead': 0, scope: 0,
  };
  const zoneIndex = (node) => placements[node?.id] ?? 0;
  const position = (node) => {
    const z = zones[zoneIndex(node)];
    return { x: z.x + 114, y: z.y + 145, z: 1 };
  };
  function create(page) {
    const connected = page.nodes.filter((n) => page.edges.some((e) => e.source === n.id || e.target === n.id));
    const start = connected.find((n) => !page.edges.some((e) => !e.dashed && e.target === n.id)) || connected[0] || page.nodes[0];
    return { page, current: start?.id ?? null, visited: new Set(start ? [start.id] : []), choice: null,
      playing: false, phase: 'work', elapsed: 0, edge: null, message: '' };
  }
  const node = (state) => state.page.nodes.find((n) => n.id === state.current);
  const outgoing = (state) => state.page.edges.filter((e) => e.source === state.current);
  const nextEdge = (state) => {
    const edges = outgoing(state);
    return edges.find((e) => e.id === state.choice) || edges.find((e) => !e.dashed) || edges[0];
  };
  function locate(state, id) {
    if (!state.page.nodes.some((n) => n.id === id)) return;
    Object.assign(state, { current: id, choice: null, playing: false, phase: 'work', elapsed: 0, edge: null, message: '' });
    state.visited.add(id);
  }
  function arrive(state, edge) {
    const loop = state.visited.has(edge.target);
    state.current = edge.target; state.visited.add(edge.target);
    Object.assign(state, { phase: 'work', elapsed: 0, edge: null, choice: null, message: '' });
    if (loop) { state.playing = false; state.message = '到达已演示节点，循环已暂停'; }
  }
  function next(state) {
    const edge = state.edge || nextEdge(state);
    if (edge) arrive(state, edge);
    else { state.playing = false; state.message = state.page.edges.length ? '此路径演示完成 · 没有后续连线' : '当前页没有连线，可点击列表逐项查看'; }
  }
  function tick(state, seconds) {
    if (!state.playing || !node(state)) return false;
    state.elapsed += seconds;
    if (state.phase === 'work' && state.elapsed >= 2.4) {
      const edge = nextEdge(state);
      if (!edge) { next(state); return true; }
      state.phase = 'travel'; state.edge = edge; state.elapsed = 0; return true;
    }
    if (state.phase === 'travel' && state.elapsed >= 2.6) { arrive(state, state.edge); return true; }
    return false;
  }
  function path(state, edge) {
    const a = position(state.page.nodes.find((n) => n.id === edge.source));
    const b = position(state.page.nodes.find((n) => n.id === edge.target));
    if (a.x === b.x && a.y === b.y) return [a, { x: a.x + 35, y: a.y + 18, z: 1 }, b];
    return [a, { x: a.x, y: 246, z: 1 }, { x: b.x, y: 246, z: 1 }, b];
  }
  function pointOnPath(points, progress) {
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    let remaining = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, progress));
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i] && lengths[i] > 0) {
        const t = remaining / lengths[i], a = points[i], b = points[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 1 };
      }
      remaining -= lengths[i];
    }
    return points[points.length - 1];
  }
  return { zones, zoneIndex, position, create, node, outgoing, nextEdge, locate, next, tick, path, pointOnPath };
})();
