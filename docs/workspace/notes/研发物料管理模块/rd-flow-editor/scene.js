// Small orthographic renderer: real XYZ geometry, shaded faces and depth sorting.
// No WebGL dependency, remote models, or changes to the editor's data schema.
const FlowScene = (() => {
  const M = FlowSceneModel;
  const $ = (id) => document.getElementById(id);
  const shadeCache = new Map();
  function shade(hex, amount) {
    const key = hex + amount;
    if (!shadeCache.has(key)) {
      const rgb = hex.slice(1).match(/../g).map((n) => Math.max(0, Math.min(255, parseInt(n, 16) + amount)));
      shadeCache.set(key, 'rgb(' + rgb.join(',') + ')');
    }
    return shadeCache.get(key);
  }
  function renderer(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器不支持 Canvas，仍可使用原流程图');
    let width = 0, height = 0, scale = 1, ox = 0, oy = 0, angle = 38;
    let primitives = [], labels = [];
    const yaw = Math.PI / 5;
    function raw(p) {
      const x = p.x - 405, y = p.y - 240, a = angle * Math.PI / 180;
      const depth = x * Math.sin(yaw) + y * Math.cos(yaw);
      return { x: x * Math.cos(yaw) - y * Math.sin(yaw),
        y: depth * Math.sin(a) - p.z * Math.cos(a),
        depth: depth * Math.cos(a) + p.z * Math.sin(a) };
    }
    function project(p) {
      const v = raw(p);
      return { x: ox + v.x * scale, y: oy + v.y * scale, depth: v.depth };
    }
    function resize(value = angle) {
      angle = value;
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const corners = [0, 810].flatMap((x) => [0, 480].flatMap((y) => [-20, 106].map((z) => raw({ x, y, z }))));
      const minX = Math.min(...corners.map((p) => p.x)), maxX = Math.max(...corners.map((p) => p.x));
      const minY = Math.min(...corners.map((p) => p.y)), maxY = Math.max(...corners.map((p) => p.y));
      scale = Math.max(.02, Math.min((width - 30) / (maxX - minX), (height - 22) / (maxY - minY)));
      ox = width / 2 - (minX + maxX) / 2 * scale;
      oy = height / 2 - (minY + maxY) / 2 * scale;
    }
    function polygon(points, fill, stroke = null) {
      primitives.push({ points, fill, stroke, depth: points.reduce((sum, p) => sum + raw(p).depth, 0) / points.length });
    }
    function box(x, y, z, w, d, h, color) {
      const p = (dx, dy, dz) => ({ x: x + dx, y: y + dy, z: z + dz });
      polygon([p(0,0,h),p(w,0,h),p(w,d,h),p(0,d,h)], shade(color, 16));
      polygon([p(w,0,0),p(w,d,0),p(w,d,h),p(w,0,h)], shade(color, -18));
      polygon([p(0,d,0),p(w,d,0),p(w,d,h),p(0,d,h)], shade(color, -34));
    }
    function sphere(x, y, z, r, color) {
      const center = { x, y, z };
      primitives.push({ center, radius: r, fill: color, depth: raw(center).depth + r * .2 });
    }
    function disc(x, y, z, rx, ry, color) {
      const points = Array.from({ length: 28 }, (_, i) => {
        const a = i / 28 * Math.PI * 2;
        return { x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry, z };
      });
      polygon(points, color);
    }
    function person(x, y, color, time, walking = false, working = false, carry = false) {
      const stride = walking ? Math.sin(time * 11) * 5 : 0;
      const lift = walking ? Math.abs(Math.sin(time * 11)) * 1.3 : 0;
      disc(x, y, .7, 15, 10, '#243e3920');
      box(x - 8, y - 4 + stride, 2, 6, 8, 16 + lift, '#394d5e');
      box(x + 2, y - 4 - stride, 2, 6, 8, 16 + lift, '#394d5e');
      box(x - 9, y - 2 + stride, 1, 7, 11, 4, '#24333d');
      box(x + 1, y - 2 - stride, 1, 7, 11, 4, '#24333d');
      box(x - 10, y - 6, 17 + lift, 20, 13, 19, color);
      sphere(x, y, 43 + lift, 9, '#edbb94');
      sphere(x - 1, y - 2, 48 + lift, 8, '#4b403d');
      sphere(x - 3, y + 7, 43 + lift, 1.1, '#393b37');
      sphere(x + 4, y + 7, 43 + lift, 1.1, '#393b37');
      const arm = working ? Math.sin(time * 5) * 2 : stride;
      box(x - 14, y - 3 - arm, 22 + lift, 5, 7, 11, color);
      box(x + 10, y - 3 + arm, 22 + lift, 5, 7, 11, color);
      sphere(x - 11, y + 1 - arm, 22 + lift, 3, '#edbb94');
      sphere(x + 12, y + 1 + arm, 22 + lift, 3, '#edbb94');
      if (carry) {
        if (carry === 'document') {
          box(x - 8, y + 8, 25 + lift, 16, 3, 18, '#f0f2e9');
          box(x - 5, y + 11, 32 + lift, 10, .5, 2, '#6aa18f');
        } else {
          box(x - 9, y + 8, 21 + lift, 18, 12, 14, '#d8b078');
          box(x - 1, y + 8, 35 + lift, 3, 12, .5, '#f5e3b8');
        }
      }
    }
    function desk(x, y, color) {
      for (const dx of [3, 69]) for (const dy of [3, 33]) box(x + dx, y + dy, 1, 4, 4, 30, '#9daca5');
      box(x, y, 30, 78, 42, 5, '#d7b58a');
      box(x + 31, y + 10, 35, 18, 12, 2, '#8da5a2');
      box(x + 37, y + 13, 36, 4, 4, 9, '#6f8586');
      box(x + 22, y + 9, 44, 34, 4, 23, '#435965');
      box(x + 25, y + 13.1, 47, 28, .4, 17, '#9ed8cf');
      box(x + 27, y + 14, 50, 12, .6, 2, '#e2f5e6');
      box(x + 27, y + 14, 55, 20, .6, 2, '#e2f5e6');
      box(x + 27, y + 27, 35, 27, 10, 1, '#edf1e9');
      box(x + 6, y + 23, 35, 13, 14, .8, '#ffffff');
      box(x + 64, y + 12, 35, 7, 7, 8, color);
      box(x + 31, y + 53, 2, 4, 4, 20, '#8c9d96');
      box(x + 20, y + 43, 20, 27, 26, 6, color);
      box(x + 20, y + 64, 24, 27, 5, 24, color);
    }
    function parcel(x, y, z, w = 22) {
      box(x, y, z, w, 22, 18, '#cba678');
      box(x + w * .45, y, z + 18, 3, 22, .5, '#f1dfb7');
      box(x + 4, y + 22, z + 5, 8, .5, 6, '#f3eddd');
    }
    function shelf(x, y) {
      for (const dx of [0, 91]) for (const dy of [0, 31]) box(x + dx, y + dy, 0, 4, 4, 76, '#6f8984');
      for (const z of [6, 32, 58]) {
        box(x, y, z, 95, 35, 3, '#b6c8bc');
        parcel(x + 6, y + 4, z + 3);
        parcel(x + 37, y + 4, z + 3, 19);
        parcel(x + 67, y + 4, z + 3, 18);
      }
    }
    function plant(x, y) {
      box(x - 9, y - 9, 0, 18, 18, 18, '#eee5d4');
      box(x - 1, y - 1, 18, 3, 3, 21, '#7f9376');
      sphere(x - 6, y, 32, 11, '#74a489'); sphere(x + 6, y - 2, 39, 12, '#60987b');
      sphere(x, y + 5, 44, 10, '#88b294');
    }
    function office(zone, index, current, time) {
      const { x, y, color, type } = zone;
      if (y > 200) {
        box(x, y, 0, 89, 5, 67, '#e9eeea');
        box(x + 141, y, 0, 83, 5, 67, '#e9eeea');
      } else box(x, y, 0, 224, 5, 67, '#e9eeea');
      box(x, y, 0, 5, 113, 40, '#e9eeea');
      box(x + 5, y + 5, 0, 219, 2, 5, color);
      // Back-wall glazing / planning board.
      box(x + 16, y + 5.1, 27, 67, 1, 31, '#b2cdd0');
      box(x + 47, y + 6, 27, 2, 1, 31, '#e8eeea');
      box(x + 16, y + 6, 41, 67, 1, 2, '#e8eeea');
      plant(x + 206, y + 25);
      if (type === 'office') {
        desk(x + 23, y + 55, color); desk(x + 128, y + 55, color);
        box(x + 124, y + 6, 28, 58, 2, 29, '#faf9ed');
        for (let i = 0; i < 3; i++) box(x + 131 + i * 15, y + 8, 39, 9, 1, 10, ['#dcaf6d','#91b5a0','#b9a0ca'][i]);
      } else if (type === 'lab') {
        shelf(x + 12, y + 27); desk(x + 129, y + 61, color);
        box(x + 16, y + 102, 0, 59, 35, 28, '#d6e1da');
        parcel(x + 23, y + 107, 28);
      } else if (type === 'warehouse') {
        shelf(x + 15, y + 25); shelf(x + 121, y + 25);
        box(x + 31, y + 94, 0, 62, 39, 6, '#b9a080');
        parcel(x + 36, y + 100, 6); parcel(x + 66, y + 100, 6);
      } else {
        box(x + 24, y + 42, 5, 113, 53, 7, '#95a9a4');
        for (let i = 0; i < 7; i++) box(x + 29 + i * 15, y + 42, 12, 6, 53, 3, '#cad4cc');
        parcel(x + 48, y + 54, 15, 30); parcel(x + 90, y + 54, 15);
        box(x + 160, y + 48, 1, 37, 56, 21, '#b0bca3');
        parcel(x + 165, y + 55, 22);
      }
      person(x + (type === 'office' ? 105 : 181), y + 116, color, time, false, current === index);
      const anchor = { x: x + 105, y: y + 8, z: 90 };
      labels.push({ anchor, title: zone.name, caption: zone.caption, color, active: current === index });
      if (current === index) disc(x + 114, y + 145, 1.2, 23, 18, '#2b997326');
    }
    function route(points, color, dashed, time) {
      ctx.save(); ctx.beginPath();
      points.forEach((point, i) => { const p = project(point); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, 4 * scale); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash(dashed ? [6, 6] : []); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) {
        const p = project(M.pointOnPath(points, (time * .13 + i / 4) % 1));
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, 3.5 * scale), 0, Math.PI * 2);
        ctx.fillStyle = dashed ? '#c96d66' : '#ffffff'; ctx.fill();
      }
      const end = project(points[points.length - 1]);
      ctx.beginPath(); ctx.arc(end.x, end.y, Math.max(3, 7 * scale), 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    }
    function paint(items) {
      items.sort((a, b) => a.depth - b.depth);
      for (const item of items) {
        ctx.beginPath();
        if (item.center) {
          const p = project(item.center), r = item.radius * scale;
          const gradient = ctx.createRadialGradient(p.x - r * .3, p.y - r * .4, r * .08, p.x, p.y, r);
          gradient.addColorStop(0, shade(item.fill, 28)); gradient.addColorStop(1, shade(item.fill, -26));
          ctx.fillStyle = gradient; ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        } else {
          item.points.forEach((point, i) => { const p = project(point); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
          ctx.closePath(); ctx.fillStyle = item.fill;
        }
        ctx.fill();
      }
    }
    function draw(state, time) {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height); primitives = []; labels = [];
      disc(418, 251, -19, 475, 259, '#253d3820');
      box(0, 0, -15, 810, 480, 15, '#c0d0c7');
      box(0, 0, -1, 810, 480, 1, '#f7f7ee');
      // Grout lines keep the corridor visibly on the floor plane.
      for (let x = 0; x < 810; x += 45) box(x, 0, .05, .6, 480, .05, '#e4e8dd');
      for (let y = 0; y < 480; y += 45) box(0, y, .05, 810, .6, .05, '#e4e8dd');
      paint(primitives); primitives = [];
      M.zones.forEach((zone) => box(zone.x, zone.y, -1, 224, 171, 2, zone.floor));
      paint(primitives); primitives = [];
      const current = M.node(state), edge = state.edge || M.nextEdge(state);
      if (edge) route(M.path(state, edge), edge.dashed ? '#ca776e' : '#58a891', edge.dashed, time);
      M.zones.forEach((zone, index) => office(zone, index, current ? M.zoneIndex(current) : -1, time));
      plant(272, 452); plant(541, 452);
      if (current) {
        const location = state.phase === 'travel'
          ? M.pointOnPath(M.path(state, state.edge), state.elapsed / 2.6) : M.position(current);
        const parcelSteps = ['supplier', 'main', 'check', 'transfer', 'rd', 'stock', 'use', 'count', 'back', 'vendor-return'];
        person(location.x, location.y, current.color, time, state.phase === 'travel', state.phase === 'work',
          parcelSteps.includes(current.id) ? 'parcel' : 'document');
      }
      paint(primitives);
      // Screen-facing labels stay legible; geometry is not billboarded.
      for (const label of labels) {
        const p = project(label.anchor), size = Math.max(9, Math.min(13, scale * 15));
        ctx.textAlign = 'center'; ctx.font = '600 ' + size + 'px "PingFang SC",sans-serif';
        ctx.fillStyle = label.active ? '#216e50' : '#425d54';
        ctx.fillText((label.active ? '● ' : '') + label.title, p.x, p.y);
        if (width > 570 && height > 290) {
          ctx.font = '10px "PingFang SC",sans-serif'; ctx.fillStyle = '#7d8d83';
          ctx.fillText(label.caption, p.x, p.y + 15);
        }
      }
    }
    return { resize, draw };
  }
  function mount() {
    const view = renderer($('scene-canvas'));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = false, state = null, frame = 0, previous = 0, time = 0;
    function draw() { if (active && state) view.draw(state, time); }
    function sync() {
      if (!state) return;
      const current = M.node(state), edges = M.outgoing(state), next = M.nextEdge(state);
      $('scene-page-name').textContent = state.page.name;
      $('scene-progress').textContent = '已浏览 ' + state.visited.size + ' / ' + state.page.nodes.length;
      $('scene-state').textContent = !current ? '当前画布为空'
        : state.message || (state.phase === 'travel' ? '流转中 · ' + (state.edge.label || '交接下一步')
          : state.playing ? '正在办理' : '已暂停 · 可点击播放或单步查看');
      $('scene-step-title').textContent = current?.title || '先返回流程图添加步骤';
      $('scene-step-owner').textContent = current?.owner || '';
      $('scene-step-detail').textContent = current?.detail || '';
      $('scene-play').textContent = state.playing ? 'Ⅱ 暂停' : '▶ 播放';
      $('scene-play').setAttribute('aria-pressed', String(state.playing));
      $('scene-play').disabled = !current || (!state.playing && !next && state.phase !== 'travel');
      $('scene-next').disabled = !current || (!next && state.phase !== 'travel');
      $('scene-restart').disabled = !current;
      $('scene-branch-label').hidden = edges.length < 2;
      $('scene-branch').replaceChildren(...edges.map((edge) => new Option(
        (edge.dashed ? '异常 · ' : '') + (edge.label || '流转') + ' → ' + state.page.nodes.find((n) => n.id === edge.target).title, edge.id)));
      $('scene-branch').value = next?.id || '';
      $('scene-branch').disabled = state.phase === 'travel';
      $('scene-steps').querySelectorAll('button').forEach((button) => {
        button.classList.toggle('active', button.dataset.node === state.current);
        button.classList.toggle('visited', state.visited.has(button.dataset.node));
        button.setAttribute('aria-current', button.dataset.node === state.current ? 'step' : 'false');
      });
      // A read-only DOM snapshot also makes animation behavior testable.
      $('scene').dataset.node = state.current || '';
      $('scene').dataset.phase = state.phase;
      $('scene').dataset.playing = String(state.playing);
    }
    function animate(now) {
      frame = 0;
      if (!active || document.hidden || !state.playing) { previous = 0; return; }
      const dt = previous ? Math.min((now - previous) / 1000, .1) * Number($('scene-speed').value) : 0;
      previous = now; time += dt;
      if (M.tick(state, dt)) sync();
      draw(); start();
    }
    function start() {
      if (active && state?.playing && !document.hidden && !frame) frame = requestAnimationFrame(animate);
    }
    function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; previous = 0; }
    function show(page) {
      stop(); active = true; state = M.create(page); time = 0;
      state.playing = !reduced.matches && !!M.nextEdge(state);
      if (!page.edges.length) state.message = '此页无连线 · 点击下方列表浏览，不自动编排';
      $('scene-steps').replaceChildren(...page.nodes.map((node, index) => {
        const li = document.createElement('li'), button = document.createElement('button'), number = document.createElement('span');
        number.textContent = String(index + 1).padStart(2, '0'); button.append(number, document.createTextNode(node.title));
        button.dataset.node = node.id; button.onclick = () => { stop(); M.locate(state, node.id); sync(); draw(); };
        li.append(button); return li;
      }));
      view.resize(Number($('scene-angle').value)); sync(); draw(); start();
    }
    $('scene-play').onclick = () => {
      state.playing = !state.playing; state.message = ''; previous = 0;
      if (state.playing) start(); else stop();
      sync(); draw();
    };
    $('scene-next').onclick = () => { stop(); state.playing = false; M.next(state); sync(); draw(); };
    $('scene-restart').onclick = () => show(state.page);
    $('scene-branch').onchange = () => { state.choice = $('scene-branch').value; draw(); };
    $('scene-angle').oninput = () => {
      $('scene-angle-value').textContent = $('scene-angle').value + '°';
      view.resize(Number($('scene-angle').value)); draw();
    };
    new ResizeObserver(() => { if (active) { view.resize(Number($('scene-angle').value)); draw(); } }).observe($('scene-canvas'));
    document.addEventListener('visibilitychange', () => { stop(); if (!document.hidden) start(); });
    reduced.addEventListener('change', () => { if (reduced.matches && state) { state.playing = false; stop(); sync(); draw(); } });
    window.addEventListener('pagehide', stop);
    return { show, hide() { active = false; if (state) state.playing = false; stop(); }, get active() { return active; } };
  }
  return { mount };
})();
