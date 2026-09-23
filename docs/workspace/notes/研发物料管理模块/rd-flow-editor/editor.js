(() => {
  'use strict';
  const M = FlowModel;
  const $ = (id) => document.getElementById(id);
  // Capture the pristine shell before X6 mounts. Never export a mutated SVG DOM.
  const originalHtml = '<!doctype html>\n' + document.documentElement.outerHTML;
  const uid = (prefix) => `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)}`;
  const font = "'Helvetica Neue','PingFang SC','Microsoft YaHei',Arial,sans-serif";
  const tints = { '#2563eb': '#eff6ff', '#16a34a': '#f0fdf4', '#9333ea': '#faf5ff', '#0f766e': '#f0fdfa', '#dc2626': '#fef2f2', '#d97706': '#fff7ed', '#475569': '#f8fafc' };
  let doc = M.validate(JSON.parse($('embedded-document').textContent) || M.template());
  let pageIndex = 0, selected = null, blocked = false, timer, toastTimer, connectMode = false, connectionStart = null;
  let undoStack = [], redoStack = [], lastState, storageProblem = false, dirtySinceDownload = false;
  let sceneView = null;
  const storageKey = () => 'rd-flow-editor:v1:' + location.pathname + ':' + doc.id;
  let pendingDraft = null;
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) pendingDraft = M.validate(JSON.parse(raw));
  } catch { storageProblem = true; }

  const groups = Object.fromEntries(M.ports.map((name) => [name, { position: name, attrs: { circle: { r: 5, magnet: true, stroke: '#2563eb', strokeWidth: 1.5, fill: '#fff' } } }]));
  const ports = { groups, items: M.ports.map((name) => ({ id: name, group: name })) };
  const textAttrs = { fontFamily: font, fill: '#17233b', refX: 0, refY: 0, textAnchor: 'start', textVerticalAnchor: 'top', pointerEvents: 'none' };
  for (const kind of ['process', 'note', 'decision']) {
    X6.Graph.registerNode('rd-' + kind, {
      inherit: kind === 'decision' ? 'polygon' : 'rect',
      markup: [{ tagName: kind === 'decision' ? 'polygon' : 'rect', selector: 'body' }, ...['title', 'owner', 'detail'].map((selector) => ({ tagName: 'text', selector }))],
      attrs: { body: kind === 'decision' ? { refPoints: '0,50 50,0 100,50 50,100' } : { rx: 10, ry: 10 }, title: textAttrs, owner: textAttrs, detail: textAttrs },
      ports,
    }, true);
  }

  function nodeConfig(n) {
    const diamond = n.kind === 'decision';
    const left = diamond ? n.width * .24 : 20;
    const available = n.width - left * 2;
    const titleRows = M.wrap(n.title, available, 18).slice(0, 3);
    const ownerRows = M.wrap(n.owner, available, 13).slice(0, 2);
    const top = diamond ? n.height * .24 : 18;
    const ownerY = top + titleRows.length * 24 + 6;
    const detailY = ownerY + ownerRows.length * 18 + 10;
    const count = Math.max(0, Math.floor((n.height - detailY - (diamond ? n.height * .2 : 16)) / 21));
    const allRows = M.wrap(n.detail, available, 14);
    const rows = allRows.slice(0, count);
    if (allRows.length > count && count > 0) rows[count - 1] = rows[count - 1].slice(0, -1) + '…';
    return {
      id: n.id, shape: 'rd-' + n.kind, x: n.x, y: n.y, width: n.width, height: n.height, zIndex: 2, data: M.clone(n),
      attrs: {
        body: { fill: tints[n.color], stroke: n.color, strokeWidth: 1.5 },
        title: { x: left, y: top, text: titleRows.join('\n'), fontSize: 18, fontWeight: 600, lineHeight: 24 },
        owner: { x: left, y: ownerY, text: ownerRows.join('\n'), fontSize: 13, fill: n.color, fontWeight: 550, lineHeight: 18 },
        detail: { x: left, y: detailY, text: rows.join('\n'), fontSize: 14, fill: '#4b5b72', lineHeight: 21 },
      },
    };
  }
  function edgeConfig(e) {
    return { id: e.id, shape: 'edge', zIndex: 1, data: M.clone(e),
      source: { cell: e.source, port: e.sourcePort }, target: { cell: e.target, port: e.targetPort }, vertices: e.vertices,
      router: { name: 'manhattan', args: { padding: 28 } }, connector: { name: 'rounded', args: { radius: 10 } },
      attrs: { line: { stroke: e.color, strokeWidth: 2, strokeDasharray: e.dashed ? '7 5' : '', targetMarker: { name: 'block', width: 9, height: 7 } } },
      labels: e.label ? [{ position: { distance: .5, offset: -12 }, attrs: { label: { text: e.label, fontSize: 13, fontFamily: font, fill: e.color }, body: { fill: '#fff', stroke: '#e2e8f0', rx: 4, ry: 4 } } }] : [],
    };
  }
  const graph = new X6.Graph({
    container: $('graph'), autoResize: true, async: false,
    grid: { size: 10, visible: true, type: 'dot', args: { color: '#d5deeb', thickness: 1 } },
    panning: true, mousewheel: { enabled: true, minScale: .2, maxScale: 2.5 }, scaling: { min: .2, max: 2.5 },
    interacting: { nodeMovable: true, edgeLabelMovable: false },
    connecting: {
      snap: { radius: 30 }, allowBlank: false, allowLoop: false, allowNode: false, allowEdge: false, allowPort: true, highlight: true,
      createEdge() {
        const cfg = edgeConfig(M.edge(uid('edge'), '', ''));
        delete cfg.source; delete cfg.target;
        return graph.createEdge(cfg);
      },
      validateConnection({ sourceCell, targetCell, targetMagnet }) { return !!targetMagnet && sourceCell !== targetCell; },
    },
  });

  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
  }
  function confirmAction(title, message) {
    $('confirm-title').textContent = title; $('confirm-message').textContent = message;
    const dialog = $('confirm-dialog');
    return new Promise((resolve) => {
      const finish = (value) => { dialog.oncancel = null; $('accept-confirm').onclick = null; $('cancel-confirm').onclick = null; dialog.close(); resolve(value); };
      $('accept-confirm').onclick = () => finish(true); $('cancel-confirm').onclick = () => finish(false);
      dialog.oncancel = (event) => { event.preventDefault(); finish(false); };
      dialog.showModal(); $('cancel-confirm').focus();
    });
  }
  function syncPage() {
    doc.pages[pageIndex].nodes = graph.getNodes().map((n) => ({ ...n.getData(), ...n.getPosition(), ...n.getSize() }));
    doc.pages[pageIndex].edges = graph.getEdges().filter((e) => e.getSourceCellId() && e.getTargetCellId()).map((e) => ({
      ...e.getData(), source: e.getSourceCellId(), target: e.getTargetCellId(),
      sourcePort: e.getSourcePortId(), targetPort: e.getTargetPortId(), vertices: e.getVertices(),
    }));
  }
  function persist() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(M.validate(doc)));
      $('status').textContent = '草稿已保存在当前浏览器 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
      storageProblem = false;
    } catch { storageProblem = true; $('status').textContent = '本地草稿保存失败，请下载 HTML 或 JSON 备份'; }
  }
  function updateChrome() {
    $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length;
    $('delete').disabled = !selected; $('duplicate').disabled = !selected || !selected.isNode();
    for (const id of ['add-process', 'add-decision', 'add-note', 'connect']) $(id).disabled = !!sceneView?.active;
    if (sceneView?.active) for (const id of ['undo', 'redo', 'delete', 'duplicate']) $(id).disabled = true;
    $('counts').textContent = `${graph.getNodes().length} 个节点 · ${graph.getEdges().length} 条连线`;
    $('zoom-value').textContent = Math.round(graph.zoom() * 100) + '%';
    const jump = $('jump'); jump.replaceChildren(new Option('选择一个节点…', ''));
    graph.getNodes().forEach((n) => jump.add(new Option(n.getData().title, n.id)));
  }
  function record() {
    clearTimeout(timer);
    if (blocked) return;
    syncPage();
    const next = JSON.stringify(doc);
    if (next !== lastState) {
      undoStack.push(lastState); if (undoStack.length > 60) undoStack.shift();
      redoStack = []; lastState = next; dirtySinceDownload = true; persist();
    }
    updateChrome();
  }
  function schedule() { if (!blocked) { clearTimeout(timer); timer = setTimeout(record, 280); } }
  function selectedStyle(cell, active) {
    const view = graph.findViewByCell(cell);
    if (view) view.container.classList.toggle('is-selected', active);
    if (!active) cell.removeTools();
    else if (cell.isEdge()) cell.addTools(['vertices', 'source-arrowhead', 'target-arrowhead']);
  }
  function select(cell) {
    if (selected) selectedStyle(selected, false);
    selected = cell || null;
    $('properties').hidden = !cell; $('empty-panel').hidden = !!cell;
    $('panel-title').textContent = cell ? '编辑属性' : '流程导航';
    $('selection-kind').textContent = cell ? cell.isNode() ? '节点' : '连线' : '未选中';
    if (cell) {
      selectedStyle(cell, true);
      const data = cell.getData();
      $('node-fields').hidden = !cell.isNode(); $('edge-fields').hidden = !cell.isEdge();
      $('element-color').value = data.color;
      if (cell.isNode()) {
        $('node-title').value = data.title; $('node-owner').value = data.owner; $('node-detail').value = data.detail;
        $('node-width').value = cell.getSize().width; $('node-height').value = cell.getSize().height;
      } else { $('edge-label').value = data.label || ''; $('edge-dashed').checked = data.dashed; }
    }
    updateChrome();
  }
  function fit() { if (graph.getNodes().length) graph.zoomToFit({ useCellGeometry: false, padding: { top: 70, right: 45, bottom: 75, left: 45 }, maxScale: 1 }); updateChrome(); }
  function renderPage(autoFit = true) {
    blocked = true; select(null);
    const p = doc.pages[pageIndex];
    graph.fromJSON({ cells: [...p.nodes.map(nodeConfig), ...p.edges.map(edgeConfig)] });
    blocked = false;
    $('document-title').value = doc.title;
    $('tabs').replaceChildren(...doc.pages.map((page, index) => {
      const b = document.createElement('button'); b.textContent = page.name; b.className = index === pageIndex ? 'active' : ''; b.setAttribute('aria-current', index === pageIndex ? 'page' : 'false');
      b.onclick = () => { record(); setConnect(false); pageIndex = index; renderPage(); };
      return b;
    }));
    updateChrome();
    if (autoFit) {
      fit();
      if (graph.zoom() < .6) {
        graph.zoomTo(.7);
        const box = graph.getContentArea();
        graph.translate(45 - box.x * .7, 75 - box.y * .7);
      }
    }
    if (sceneView?.active) sceneView.show(M.clone(p));
  }
  function setScene(active) {
    if (active) {
      try { if (!sceneView) sceneView = FlowScene.mount(); }
      catch (error) { toast(error.message); return; }
      record(); setConnect(false); select(null);
    } else sceneView?.hide();
    document.querySelector('.workspace').classList.toggle('scene-mode', active);
    document.body.classList.toggle('scene-open', active);
    $('scene').hidden = !active;
    $('editor-aside').hidden = active; $('scene-aside').hidden = !active;
    $('scene-toggle').classList.toggle('active', active);
    $('scene-toggle').setAttribute('aria-pressed', String(active));
    if (active) sceneView.show(M.clone(doc.pages[pageIndex]));
    updateChrome();
    $('status').textContent = active ? '离线场景模拟 · 示意布局 · 不操作任何 WMS 数据'
      : storageProblem ? '本地草稿不可用，请下载备份' : '离线就绪 · 修改会自动保存为浏览器草稿';
  }
  function applyNode(n, changes) {
    record();
    const next = { ...n.getData(), ...n.getPosition(), ...n.getSize(), ...changes };
    // Validate the complete replacement before mutating the live graph.
    M.validate({ ...doc, pages: [{ ...doc.pages[pageIndex], nodes: [next], edges: [] }] });
    const cfg = nodeConfig(next);
    blocked = true;
    n.resize(next.width, next.height); n.position(next.x, next.y); n.setData(next); n.attr(cfg.attrs);
    blocked = false; record(); select(n);
  }
  function applyEdge(e, changes) {
    record();
    const next = { ...e.getData(), source: e.getSourceCellId(), target: e.getTargetCellId(), sourcePort: e.getSourcePortId(), targetPort: e.getTargetPortId(), vertices: e.getVertices(), ...changes };
    const cfg = edgeConfig(next);
    blocked = true; e.setData(next); e.attr(cfg.attrs); e.setLabels(cfg.labels); blocked = false; record(); select(e);
  }
  function addNode(kind) {
    if (graph.getNodes().length >= 200) return toast('每页最多 200 个节点');
    record();
    const bounds = $('graph').getBoundingClientRect();
    const p = graph.clientToLocal(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    const n = M.node(uid('node'), Math.round((p.x - 170) / 10) * 10, Math.round((p.y - 76) / 10) * 10,
      kind === 'decision' ? '是否满足条件？' : kind === 'note' ? '业务说明' : '新步骤', '负责人', kind === 'decision' ? '编辑条件与分支' : '双击修改文字', kind === 'decision' ? '#d97706' : '#2563eb', kind, 340, kind === 'decision' ? 240 : 152);
    const cell = graph.addNode(nodeConfig(n)); record(); select(cell); return cell;
  }
  function setConnect(value) {
    connectMode = value; connectionStart = null; $('connect').classList.toggle('active', value);
    $('canvas-hint').textContent = value ? '先点击起点节点，再点击终点节点 · Esc 取消' : '拖动节点 · 双击改字 · 从圆点拖出连线 · 拖动空白平移';
  }
  function makeConnection(source, target) {
    if (source.id === target.id) return toast('请选择另一个节点');
    if (graph.getEdges().length >= 400) return toast('每页最多 400 条连线');
    const a = source.getBBox().center, b = target.getBBox().center;
    let sp, tp;
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) { sp = b.x >= a.x ? 'right' : 'left'; tp = b.x >= a.x ? 'left' : 'right'; }
    else { sp = b.y >= a.y ? 'bottom' : 'top'; tp = b.y >= a.y ? 'top' : 'bottom'; }
    const e = graph.addEdge(edgeConfig(M.edge(uid('edge'), source.id, target.id, sp, tp)));
    record(); select(e); setConnect(false);
  }
  function textEdit(cell) {
    select(cell); const d = cell.getData();
    $('edit-title').value = cell.isNode() ? d.title : d.label;
    $('edit-title').maxLength = cell.isNode() ? 100 : 120;
    $('edit-title').required = cell.isNode();
    $('edit-node-extra').hidden = !cell.isNode();
    $('edit-owner').value = d.owner || ''; $('edit-detail').value = d.detail || '';
    $('text-dialog').showModal(); $('edit-title').focus();
  }
  function undo(redo = false) {
    record(); const from = redo ? redoStack : undoStack, to = redo ? undoStack : redoStack;
    if (!from.length) return;
    to.push(lastState); lastState = from.pop(); doc = JSON.parse(lastState);
    pageIndex = Math.min(pageIndex, doc.pages.length - 1); renderPage(false); persist(); dirtySinceDownload = true;
  }
  function safeName() { return (doc.title || '流程图').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 70); }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function exportHtml() {
    record(); const copy = M.validate(doc); copy.id = uid('doc');
    const html = originalHtml.replace(/(<script id="embedded-document" type="application\/json">)[\s\S]*?(<\/script>)/,
      (_, start, end) => start + M.encode(copy) + end);
    download(new Blob([html], { type: 'text/html;charset=utf-8' }), safeName() + '-可编辑.html');
    dirtySinceDownload = false; toast('已下载最新离线 HTML；请用新文件分享或继续编辑');
  }
  function snapshotSvg() {
    const viewport = graph.view.stage.cloneNode(true);
    viewport.removeAttribute('transform');
    viewport.querySelectorAll('.x6-node-tools,.x6-edge-tools,.x6-port,.x6-widget-selection,.x6-widget-transform').forEach((el) => el.remove());
    viewport.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
    const defs = graph.view.svg.querySelector('defs');
    // Rendered bounds include routed edge detours and labels outside node boxes.
    const box = graph.getContentArea({ useCellGeometry: false });
    const width = Math.ceil(box.width + 80), height = Math.ceil(box.height + 120);
    const esc = (v) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${box.x - 40} ${box.y - 65} ${width} ${height}"><style>text{font-family:${font}} .x6-port,.x6-node-tools,.x6-edge-tools{display:none}</style>${defs ? new XMLSerializer().serializeToString(defs) : ''}<rect x="${box.x - 40}" y="${box.y - 65}" width="${width}" height="${height}" fill="#fff"/><text x="${box.x}" y="${box.y - 30}" font-size="21" font-weight="600" fill="#17233b">${esc(doc.title)} · ${esc(doc.pages[pageIndex].name)}</text>${new XMLSerializer().serializeToString(viewport)}</svg>`;
  }
  async function exportImage(png) {
    if (!graph.getNodes().length) return toast('当前画布为空');
    let url;
    try {
      record(); const svg = snapshotSvg();
      if (!png) return download(new Blob([svg], { type: 'image/svg+xml' }), safeName() + '.svg');
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image(); img.src = url; await img.decode();
      const scale = Math.min(2, 8000 / img.width, 8000 / img.height, Math.sqrt(20000000 / (img.width * img.height)));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG 生成失败');
      download(blob, safeName() + '.png'); toast('已导出当前画布 PNG');
    } catch { toast('图片导出失败，请尝试 SVG 或缩小画布范围'); }
    finally { if (url) URL.revokeObjectURL(url); }
  }

  graph.on('node:click', ({ node }) => {
    if (connectMode) {
      if (!connectionStart) { connectionStart = node; select(node); $('canvas-hint').textContent = '起点已选择，现在点击终点节点'; }
      else makeConnection(connectionStart, node);
    } else select(node);
  });
  graph.on('edge:click', ({ edge }) => select(edge));
  graph.on('blank:click', () => select(null));
  graph.on('node:dblclick', ({ node }) => textEdit(node));
  graph.on('edge:dblclick', ({ edge }) => textEdit(edge));
  graph.on('scale', updateChrome);
  for (const key of ['position', 'size', 'data', 'source', 'target', 'vertices']) graph.on('cell:change:' + key, schedule);
  graph.on('node:moved', record);
  graph.on('edge:connected', ({ edge }) => {
    if (graph.getEdges().length > 400) { graph.removeEdge(edge); toast('每页最多 400 条连线'); return; }
    record(); select(edge);
  });

  $('properties').onsubmit = (event) => {
    event.preventDefault(); if (!selected) return;
    try {
      if (selected.isNode()) applyNode(selected, { title: $('node-title').value, owner: $('node-owner').value, detail: $('node-detail').value, width: Number($('node-width').value), height: Number($('node-height').value), color: $('element-color').value });
      else applyEdge(selected, { label: $('edge-label').value, dashed: $('edge-dashed').checked, color: $('element-color').value });
      toast('修改已应用');
    } catch (error) { toast(error.message); }
  };
  $('text-form').onsubmit = (event) => {
    event.preventDefault();
    if (!selected) return;
    try {
      if (selected.isNode()) applyNode(selected, { title: $('edit-title').value, owner: $('edit-owner').value, detail: $('edit-detail').value });
      else applyEdge(selected, { label: $('edit-title').value });
      $('text-dialog').close();
    } catch (error) { toast(error.message); }
  };
  $('cancel-edit').onclick = () => $('text-dialog').close();
  $('add-process').onclick = () => addNode('process'); $('add-decision').onclick = () => addNode('decision'); $('add-note').onclick = () => addNode('note');
  $('scene-toggle').onclick = () => setScene(!sceneView?.active);
  $('scene-edit').onclick = () => setScene(false);
  $('scene-close').onclick = () => { setScene(false); $('scene-toggle').focus(); };
  $('connect').onclick = () => setConnect(!connectMode);
  $('undo').onclick = () => undo(); $('redo').onclick = () => undo(true);
  $('delete').onclick = () => {
    if (!selected) return;
    record(); const cell = selected; select(null); graph.removeCell(cell); record();
  };
  $('duplicate').onclick = () => {
    if (!selected?.isNode() || graph.getNodes().length >= 200) return;
    record(); const n = selected.getData(), p = selected.getPosition();
    const copy = graph.addNode(nodeConfig({ ...n, ...selected.getSize(), id: uid('node'), x: p.x + 40, y: p.y + 40 })); record(); select(copy);
  };
  $('save').onclick = () => { record(); persist(); toast(storageProblem ? '无法保存草稿，请下载 HTML 或 JSON' : '草稿已保存；分享前请下载当前 HTML'); };
  $('document-title').onchange = () => { doc.title = $('document-title').value; record(); };
  $('export-html').onclick = exportHtml;
  $('export-json').onclick = () => { record(); download(new Blob([JSON.stringify(M.validate(doc), null, 2)], { type: 'application/json' }), safeName() + '.json'); dirtySinceDownload = false; toast('已导出全部页面的编辑数据'); };
  $('import-json').onclick = () => $('import-file').click();
  $('import-file').onchange = async (event) => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('文件超过 5 MB，请选择本编辑器导出的 JSON');
      const incoming = M.validate(JSON.parse(await file.text()));
      if (!await confirmAction('导入流程数据', '将替换当前全部画布（可撤销）。未备份的内容建议先导出 JSON。')) return;
      record(); incoming.id = doc.id; doc = incoming; pageIndex = 0; renderPage(); record(); toast('导入完成');
    } catch (error) { toast('导入失败：' + error.message); }
  };
  $('reset').onclick = async () => {
    if (!await confirmAction('恢复预置流程', '将替换全部画布。当前内容可通过撤销找回，建议先下载备份。')) return;
    record(); const id = doc.id; doc = M.template(); doc.id = id; pageIndex = 0; renderPage(); record(); toast('已恢复预置流程，可撤销');
  };
  $('export-svg').onclick = () => exportImage(false); $('export-png').onclick = () => exportImage(true);
  $('zoom-in').onclick = () => graph.zoom(.15); $('zoom-out').onclick = () => graph.zoom(-.15);
  $('fit').onclick = fit; $('actual').onclick = () => { graph.zoomTo(1); graph.centerContent(); };
  $('jump').onchange = () => { const n = graph.getCellById($('jump').value); if (n) { graph.zoomTo(1); graph.centerCell(n); select(n); } };
  $('help').onclick = () => $('help-dialog').showModal(); $('close-help').onclick = () => $('help-dialog').close();
  window.addEventListener('keydown', (event) => {
    if (event.target.closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]')) return;
    if (sceneView?.active) {
      if (event.key === 'Escape') { event.preventDefault(); setScene(false); }
      if (event.key === ' ' && !event.target.closest('button')) { event.preventDefault(); $('scene-play').click(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); $('save').click(); }
      if (event.key === 'Backspace' || event.key === 'Delete' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z')) event.preventDefault();
      return;
    }
    if (event.key === 'Escape') { setConnect(false); select(null); }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); $('delete').click(); }
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey); }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); $('save').click(); }
    }
  });
  window.addEventListener('beforeunload', (event) => {
    record();
    if (storageProblem && dirtySinceDownload) { event.preventDefault(); event.returnValue = ''; }
  });
  renderPage(); lastState = JSON.stringify(doc);
  $('status').textContent = storageProblem ? '无法读取本地草稿，请定期下载备份' : '离线就绪 · 修改会自动保存为浏览器草稿';
  if (pendingDraft && JSON.stringify(pendingDraft) !== lastState) {
    confirmAction('发现本地草稿', '是否恢复同一文件此前保存的修改？取消将使用文件内置内容，不会立即覆盖旧草稿。').then((yes) => {
      if (yes) { doc = pendingDraft; renderPage(); lastState = JSON.stringify(doc); $('status').textContent = '已恢复浏览器草稿'; }
    });
  }
  // Optional browser-native agent access. No network, account, or service needed.
  const api = {
    read() { syncPage(); return M.clone(doc); },
    editNode(input) {
      if (!input || typeof input.id !== 'string' || typeof input.title !== 'string' || input.title.length > 100) throw new Error('需要有效的节点 id 和不超过 100 字的标题');
      const index = doc.pages.findIndex((p) => p.nodes.some((n) => n.id === input.id));
      if (index < 0) throw new Error('节点不存在');
      record(); pageIndex = index; renderPage(false); const node = graph.getCellById(input.id); applyNode(node, { title: input.title }); return { id: node.id, title: node.getData().title };
    },
  };
  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const tools = [
      { name: 'read_flow_document', description: '读取当前离线流程文档全部页面', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => api.read() },
      { name: 'edit_flow_node_title', description: '修改指定流程节点标题并保存本机草稿', inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string', maxLength: 100 } }, required: ['id', 'title'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: (input) => api.editNode(input) },
    ];
    for (const tool of tools) {
      try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional API; editing remains available. */ }
    }
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
})();
