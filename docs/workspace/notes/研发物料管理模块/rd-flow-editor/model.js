// Only this closed data schema crosses the import/export boundary; SVG markup,
// arbitrary X6 tools, URLs and executable options are never accepted from files.
const FlowModel = (() => {
  const colors = ['#2563eb', '#16a34a', '#9333ea', '#0f766e', '#dc2626', '#d97706', '#475569'];
  const ports = ['top', 'right', 'bottom', 'left'];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const node = (id, x, y, title, owner, detail, color = colors[0], kind = 'process', width = 340, height = 152) =>
    ({ id, kind, x, y, width, height, title, owner, detail, color });
  const edge = (id, source, target, sourcePort = 'right', targetPort = 'left', label = '', color = colors[0], dashed = false) =>
    ({ id, source, target, sourcePort, targetPort, label, color, dashed, vertices: [] });
  function template() {
    return {
      format: 'rd-flow-editor', version: 1, id: 'rd-material-flow-v1', title: '研发物料管理 · 业务流程',
      pages: [
        { id: 'procurement', name: '01 采购与交接', nodes: [
          node('plan', 80, 80, '01  项目与 BOM 计划', '曹艳 · 研发仓库管理员', '依据研发需求维护项目、计划数量与参考成本；结合库存、耗用和在途量查看缺口。'),
          node('draft', 520, 80, '02  填写采购草稿', '研发人员 · 实际申请人', '关联有效研发项目，填写物料、规格、数量、需求日期和用途；可保存、修改授权草稿。'),
          node('review', 960, 80, '03  复核、修改并提交', '曹艳 · 研发仓库管理员', '确认需求与必填项，保留申请人和提交人。提交后直接进入采购跟踪，无系统审批流。'),
          node('rejected', 1400, 340, '采购驳回', '徐文静 · 采购', '记录驳回及原因；驳回后的修改、重新提交规则需业务确认，不预设自动回草稿。', colors[4], 'note'),
          node('buy', 960, 340, '04  采购执行与跟踪', '徐文静 · 采购', '维护采购状态、供应商、数量、单价/金额、计划到货日和备注，持续更新到货进度。', colors[2]),
          node('supplier', 520, 340, '05  供应商分批送货', '供应商', '按采购安排分批送至主仓。每批到货分别登记，不必等待全部到齐。', colors[1]),
          node('main', 80, 340, '06  主仓办理入库', '田晓晶 · 主仓', '按实际到货关联采购申请及物料行入库；累计已到货/未到货量，防止重复入库。', colors[1]),
          node('check', 80, 600, '07  领料核对', '曹艳 · 研发仓库管理员', '到主仓领取物料，核对品类、规格和数量。物料核对责任由曹艳承担。'),
          node('transfer', 520, 600, '08  点击“调入研发”', '田晓晶操作 · 系统同步记账', '同一动作完成主仓减少、研发仓增加；留存项目归属、交接人员、时间及来源关系。', colors[3]),
          node('rd', 960, 600, '09  研发项目库存管理', '曹艳 · 研发仓库管理员', '无需二次确认收货。按项目办理领用、退料、报废、盘点和调整，详见第 02 页。'),
          node('notes', 80, 860, '阅读与业务边界', '实线：主流程 / 物料交接；红色虚线：异常', 'BOM 和采购申请不改变库存；仓间转移不等于项目耗用。取消、更正及异常需留痕。具体到货状态名称另行确认。', colors[6], 'note', 1220, 150),
        ], edges: [
          edge('a1', 'plan', 'draft'), edge('a2', 'draft', 'review'),
          edge('a3', 'review', 'buy', 'bottom', 'top', '已提交'),
          edge('a4', 'buy', 'supplier', 'left', 'right', '采购推进'),
          edge('a5', 'supplier', 'main', 'left', 'right', '每批到货', colors[1]),
          edge('a6', 'main', 'check', 'bottom', 'top'), edge('a7', 'check', 'transfer'), edge('a8', 'transfer', 'rd'),
          edge('a9', 'buy', 'rejected', 'right', 'left', '驳回', colors[4], true),
        ] },
        { id: 'inventory', name: '02 项目库存与成本', nodes: [
          node('stock', 80, 80, '研发项目在库物料', '曹艳 · 统一管理研发仓库', '所有进入研发仓及后续项目动作绑定项目。项目不是额外的物理仓库。'),
          node('use', 520, 80, '领用、退料、报废', '曹艳 · 按项目登记', '分别记录领用量、退料量、报废量和成本；区分结存、实际耗用与报废。'),
          node('ledger', 960, 80, '项目台账与计划对照', '授权人员查询', '查看交接入项目、在库、已领、已退、已报废和净耗用；追溯实际业务，与 BOM 对照。', colors[1]),
          node('count', 80, 360, '盘点与库存调整', '曹艳 · 研发仓库管理员', '按项目、物料核对实物与系统数，记录差异、原因及调整流水，盘点差异单独展示。', colors[5]),
          node('back', 520, 360, '退回主仓', '田晓晶 · 主仓人员操作', '记录原因、经办人和时间；保留研发仓减少与主仓增加的反向库存流水。', colors[4]),
          node('vendor-return', 960, 360, '向供应商退货', '田晓晶 · 公司级退货操作', '办理公司级退货并保留原因及反向流水；已发生的库存事实不得静默覆盖。', colors[4]),
          node('rules', 80, 650, '三种变化，分开看', '调拨 ≠ 耗用；盘点差异独立留痕', '领用、退料和报废按项目统计；申请、采购、入库阶段金额分别展示，不重复相加，不称为实际付款。退回主仓与供应商退货是异常业务，不是必经步骤。', colors[6], 'note', 1220, 160),
        ], edges: [
          edge('b1', 'stock', 'use'), edge('b2', 'use', 'ledger', 'right', 'left', '汇总实际记录', colors[1]),
          edge('b3', 'stock', 'count', 'left', 'left', '盘点', colors[5]),
          edge('b4', 'stock', 'back', 'bottom', 'top', '在库物料需退回', colors[4], true),
          edge('b5', 'back', 'vendor-return', 'right', 'left', '如需退供应商', colors[4], true),
        ] },
        { id: 'roles', name: '03 角色职责', nodes: [
          node('role-rd', 80, 80, '研发人员', '采购单据上的实际申请人', '可新建、保存、修改本人/授权范围草稿；查询授权采购进度、项目/BOM、库存和成本。无复核提交、BOM 维护及库存操作权限。', colors[0], 'note', 360, 245),
          node('role-cao', 540, 80, '曹艳', '研发仓库管理员', '维护项目与 BOM、参考成本；复核、修改并提交采购申请；主仓领料核对；统一办理研发仓按项目领用、退料、报废、盘点及调整。', colors[0], 'note', 360, 245),
          node('role-buy', 1000, 80, '徐文静', '采购负责人', '查看已提交需求；维护驳回、采购中等状态；更新供应商、采购数量、单价/金额、计划到货日和采购执行信息。', colors[2], 'note', 360, 245),
          node('role-main', 80, 430, '田晓晶', '主仓负责人', '办理主仓入库和仓库交接；点击“调入研发”；操作退回主仓及公司级退货。领料时的物料核对由曹艳负责。', colors[1], 'note', 360, 245),
          node('role-admin', 540, 430, '系统管理员', '配置、排障和审计', '配置权限并排障；越权修改应被拒绝并留痕。不是采购或库存业务的默认代办人。', colors[6], 'note', 360, 245),
          node('role-lead', 1000, 430, '项目负责人 / 管理层', '崔永琪负责建设交付', '立项申请人是崔永琪，不替代采购实际申请人。立项、设计冻结和正式上线按公司制度审批，与本模块采购业务无系统审批流的边界分开。', colors[5], 'note', 360, 245),
          node('scope', 80, 780, '本期不包含', '公司现行制度仍适用', '线上采购审批及外部审批接口；付款、发票、报销及完整财务核算；供应商年度评价；生产车间采购/库存；开放式多仓、库位和复杂调度。', colors[4], 'note', 1280, 145),
        ], edges: [] },
      ],
    };
  }
  function validate(input) {
    const fail = (message) => { throw new Error(message); };
    const string = (value, max, label) => typeof value === 'string' && value.length <= max ? value : fail(`${label}格式不正确或过长`);
    const id = (value) => typeof value === 'string' && /^[\w-]{1,90}$/.test(value) ? value : fail('元素标识格式不正确');
    const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max ? value : fail('位置或尺寸超出允许范围');
    const color = (value) => colors.includes(value) ? value : fail('颜色不受支持');
    const unique = (items) => new Set(items.map((item) => item.id)).size === items.length || fail('存在重复标识');
    if (!input || input.format !== 'rd-flow-editor' || input.version !== 1) fail('请选择本编辑器导出的 v1 JSON 文件');
    if (!Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 8) fail('页面数量须为 1–8');
    const result = { format: input.format, version: 1, id: id(input.id), title: string(input.title, 100, '文档名称'), pages: input.pages.map((page) => {
      if (!Array.isArray(page.nodes) || !Array.isArray(page.edges) || page.nodes.length > 200 || page.edges.length > 400) fail('每页最多 200 节点、400 连线');
      const nodes = page.nodes.map((n) => ({
        id: id(n.id), kind: ['process', 'decision', 'note'].includes(n.kind) ? n.kind : fail('不支持的节点类型'),
        x: number(n.x, -20000, 20000), y: number(n.y, -20000, 20000),
        width: number(n.width, 180, 1800), height: number(n.height, 100, 1200),
        title: string(n.title, 100, '标题'), owner: string(n.owner, 100, '负责人'), detail: string(n.detail, 2000, '说明'), color: color(n.color),
      }));
      const ids = new Set(nodes.map((n) => n.id));
      const edges = page.edges.map((e) => {
        if (!ids.has(e.source) || !ids.has(e.target)) fail('连线引用了不存在的节点');
        if (!ports.includes(e.sourcePort) || !ports.includes(e.targetPort)) fail('连接端口无效');
        if (!Array.isArray(e.vertices) || e.vertices.length > 30) fail('折点数量无效');
        return { id: id(e.id), source: e.source, target: e.target, sourcePort: e.sourcePort, targetPort: e.targetPort,
          label: string(e.label, 120, '连线文字'), color: color(e.color), dashed: e.dashed === true,
          vertices: e.vertices.map((v) => ({ x: number(v.x, -20000, 20000), y: number(v.y, -20000, 20000) })) };
      });
      unique([...nodes, ...edges]);
      return { id: id(page.id), name: string(page.name, 60, '页面名称'), nodes, edges };
    }) };
    unique(result.pages);
    return result;
  }
  function encode(value) { return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026'); }
  function wrap(text, width, size) {
    const rows = [];
    for (const paragraph of text.split('\n')) {
      let line = '', used = 0;
      for (const ch of paragraph) {
        const step = /[\u0000-\u00ff]/.test(ch) ? size * 0.57 : size;
        if (used + step > width && line) { rows.push(line); line = ''; used = 0; }
        line += ch; used += step;
      }
      rows.push(line);
    }
    return rows;
  }
  return { colors, ports, clone, node, edge, template, validate, encode, wrap };
})();
