import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('./model.js', import.meta.url), 'utf8');
const M = vm.runInNewContext(source + '\nFlowModel;', {});
const sceneSource = await readFile(new URL('./scene-model.js', import.meta.url), 'utf8');
const S = vm.runInNewContext(sceneSource + '\nFlowSceneModel;', {});

test('scene follows actual procurement edges, stops at the endpoint and never mutates the document', () => {
  const doc = M.template(), before = JSON.stringify(doc), state = S.create(doc.pages[0]), route = [state.current];
  state.playing = true;
  for (let i = 0; i < 9; i++) {
    S.tick(state, 2.4);
    if (state.phase === 'travel') { S.tick(state, 2.6); route.push(state.current); }
  }
  assert.deepEqual(route, ['plan', 'draft', 'review', 'buy', 'supplier', 'main', 'check', 'transfer', 'rd']);
  assert.equal(state.playing, false);
  assert.match(state.message, /完成/);
  assert.equal(JSON.stringify(doc), before);
});

test('scene can explicitly select rejection and does not invent a return-to-draft edge', () => {
  const state = S.create(M.template().pages[0]);
  S.locate(state, 'buy'); state.choice = 'a9'; state.playing = true;
  S.tick(state, 2.4); assert.equal(state.edge.target, 'rejected');
  S.tick(state, 2.6); S.tick(state, 2.4);
  assert.equal(state.current, 'rejected'); assert.equal(state.playing, false);
  assert.equal(S.outgoing(state).length, 0);
});

test('inventory branches remain alternatives and roles are not fabricated as a sequence', () => {
  const doc = M.template(), state = S.create(doc.pages[1]);
  assert.equal(S.nextEdge(state).target, 'use');
  state.choice = 'b4'; S.next(state); assert.equal(state.current, 'back');
  S.next(state); assert.equal(state.current, 'vendor-return');
  const roles = S.create(doc.pages[2]); S.next(roles);
  assert.equal(roles.current, 'role-rd'); assert.equal(roles.playing, false);
  assert.match(roles.message, /没有连线/);
});

test('scene supports edits, custom nodes, empty pages, pause, and cyclic routes safely', () => {
  const page = { id: 'custom', name: '自定义', nodes: [
    M.node('one', 0, 0, '自定义第一步', '', ''),
    M.node('two', 200, 0, '<script>普通文字</script>', '', ''),
  ], edges: [M.edge('e1', 'one', 'two'), M.edge('e2', 'two', 'one')] };
  const state = S.create(page); S.tick(state, 100);
  assert.equal(state.current, 'one'); assert.equal(state.elapsed, 0);
  state.playing = true; S.next(state); assert.equal(S.node(state).title, page.nodes[1].title);
  S.next(state); assert.equal(state.playing, false); assert.match(state.message, /循环/);
  const empty = S.create({ ...page, nodes: [], edges: [] }); S.next(empty); S.tick(empty, 10);
  assert.equal(empty.current, null);
  assert.equal(S.position(page.nodes[0]).x, 138);
});

test('scene movement remains on connected corridor segments with exact endpoints', () => {
  const state = S.create(M.template().pages[0]), edge = state.page.edges.find((e) => e.id === 'a5');
  const path = S.path(state, edge);
  assert.deepEqual(S.pointOnPath(path, 0), path[0]);
  assert.deepEqual(S.pointOnPath(path, 1), path.at(-1));
  const p = S.pointOnPath(path, .5);
  assert.equal(p.y, 246);
  assert.ok(Number.isFinite(p.x));
});

test('preloaded document validates and has three pages', () => {
  const doc = M.validate(M.template());
  assert.equal(doc.pages.length, 3);
  assert.equal(doc.pages[0].nodes.find((node) => node.id === 'transfer').title, '08  点击“调入研发”');
});

test('labels stay plain text and unsupported styles are rejected', () => {
  const doc = M.template();
  doc.pages[0].nodes[0].title = '<script>alert(1)</script>';
  assert.doesNotThrow(() => M.validate(doc));
  doc.pages[0].nodes[0].color = '#fff';
  assert.throws(() => M.validate(doc), /颜色/);
});

test('validator rejects broken edge references', () => {
  const doc = M.template();
  doc.pages[0].edges[0].target = 'missing';
  assert.throws(() => M.validate(doc), /不存在/);
});

test('import strips arbitrary X6 markup and tool configuration', () => {
  const doc = M.template();
  doc.pages[0].nodes[0].markup = '<image href="https://example.com/tracker"/>';
  doc.pages[0].nodes[0].tools = ['node-editor'];
  const clean = M.validate(doc);
  assert.equal(clean.pages[0].nodes[0].markup, undefined);
  assert.equal(clean.pages[0].nodes[0].tools, undefined);
});

test('rejects versions, duplicate ids, excessive sizes, missing page data', () => {
  for (const change of [
    (d) => { d.version = 2; },
    (d) => { d.pages[0].nodes[1].id = d.pages[0].nodes[0].id; },
    (d) => { d.pages[0].nodes[0].width = 200000; },
    (d) => { d.pages[0].edges[0].sourcePort = 'unknown'; },
    (d) => { d.pages = []; },
  ]) { const d = M.template(); change(d); assert.throws(() => M.validate(d)); }
});

test('script terminators are safely encoded without losing text', () => {
  const value = { title: '</script><script>alert(1)</script> & <b>' };
  const encoded = M.encode(value);
  assert.equal(encoded.includes('<'), false);
  assert.deepEqual(JSON.parse(encoded), value);
});

test('position, edge label, and all pages roundtrip losslessly', () => {
  const d = M.template(); d.pages[0].nodes[0].x = 330;
  d.pages[0].edges[0].label = '新连线说明';
  d.pages[0].edges[0].vertices = [{ x: 510, y: 70 }];
  assert.equal(JSON.stringify(M.validate(JSON.parse(JSON.stringify(d)))), JSON.stringify(d));
});

test('built HTML contains no remote resources and retains the X6 license', async () => {
  const html = await readFile(new URL('../研发物料流程编辑器.html', import.meta.url), 'utf8');
  const { document } = new JSDOM(html).window;
  assert.equal(document.querySelectorAll('script[src],link[href],iframe,img[src^="http"]').length, 0);
  assert.match(document.querySelector('meta[http-equiv="Content-Security-Policy"]').content, /connect-src 'none'/);
  assert.match(html, /MIT License/);
  assert.match(html, /Permission is hereby granted/);
  assert.equal(document.querySelectorAll('#application').length, 1);
  assert.equal(document.querySelectorAll('#embedded-document').length, 1);
  new vm.Script(document.querySelector('#application').textContent);
});

test('download-style HTML embedding keeps editable document and only one application', async () => {
  const html = await readFile(new URL('../研发物料流程编辑器.html', import.meta.url), 'utf8');
  const d = M.template(); d.pages[0].nodes[0].title = '</script><script>bad()</script>';
  const exported = html.replace(/(<script id="embedded-document" type="application\/json">)[\s\S]*?(<\/script>)/, (_, a, b) => a + M.encode(d) + b);
  const { document } = new JSDOM(exported).window;
  assert.equal(document.querySelectorAll('script').length, 2);
  assert.equal(JSON.parse(document.querySelector('#embedded-document').textContent).pages[0].nodes[0].title, d.pages[0].nodes[0].title);
});
