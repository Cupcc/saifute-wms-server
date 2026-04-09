# Bun 运行时迁移变更日志

> 分支: `feature/bun-migration`
> 基于: `dev` (b37d9dc)
> 开始日期: 2026-04-09
> Bun 版本: 1.3.11
> Node 版本: 24.14.0 (对照基线)

---

## 迁移目标

将 NestJS WMS 后端的运行时从 Node.js 切换为 Bun，保持包管理器 pnpm 不变（渐进式迁移）。

## 风险评估摘要

| 组件 | 风险等级 | 实际结果 |
|------|---------|---------|
| NestJS 11 + Express | 低 | **通过** — 完整启动，所有模块加载正常 |
| Prisma 7.5 + adapter-mariadb | 中 | **通过** — DB 连接正常，API 返回 401（需鉴权） |
| ioredis | 低 | **通过** — 无连接错误 |
| winston + daily-rotate-file | 低 | **通过** — 日志正常输出 |
| Jest 30 + ts-jest | 中 | **通过** — 588/590 与 Node 基线一致 |
| class-validator/transformer | 低 | **通过** — 装饰器元数据正常 |

---

## 变更记录

### Step 0: 环境准备 (2026-04-09)

- [x] 创建隔离 worktree `.worktrees/bun-migration`
- [x] 安装依赖 `pnpm install --frozen-lockfile` — 成功
- [x] 类型检查基线 `pnpm typecheck` — 通过
- [x] 测试基线 `pnpm test` — 588/590 通过
  - 2 个已有失败: `test/feishu-lifecycle.spec.ts` (与迁移无关)

### Step 1: 运行时切换 (2026-04-09)

- [x] 修改 `package.json` scripts，将 `node` 替换为 `bun`
- [x] 修改 `ts-node` 引用为 `bun --env-file`（简化迁移脚本）
- [x] 验证 `bun dist/src/main.js` 可正常启动 — **成功**
- [x] 验证 `bun src/main.ts` 可直接运行（跳过编译）— **成功**
- [x] 记录启动时间对比（见下方）

**package.json 变更摘要：**
- `start`: `node dist/main.js` → `bun dist/src/main.js`
- 新增 `start:node`: `node dist/src/main.js`（回退用）
- `docs:search`, `lint:src-lines*`, `prisma:rebuild:collation`, `ralph:bootstrap`: `node` → `bun`
- 所有 `migration:*` 脚本: `cross-env DOTENV_CONFIG_PATH=.env.dev ts-node -r dotenv/config --project tsconfig.migration.json` → `bun --env-file .env.dev`

### Step 2: 测试兼容性验证 (2026-04-09)

- [x] `bun run test` 运行 Jest 测试套件 — **588/590 通过**（与 Node 一致）
- [x] 记录通过/失败对比 — 完全一致
- [x] 兼容性问题 — **无**

### Step 3: 自动化观察脚本 (2026-04-09)

- [x] `scripts/bun-migration/health-check.sh` — 健康检查（HTTP/DB/Redis/内存）
- [x] `scripts/bun-migration/compare-runtimes.sh` — Node vs Bun 多轮对比基准测试
- [x] `scripts/bun-migration/watch-stability.sh` — 长时间稳定性观察（后台自动运行）

---

## 性能对比数据

### 启动时间 (3 轮平均)

| 运行时 | Round 1 | Round 2 | Round 3 | 平均 |
|--------|---------|---------|---------|------|
| Bun (编译JS) | 0.553s | 0.555s | 0.551s | ~0.553s |
| Node (编译JS) | 0.548s | 0.554s | 0.551s | ~0.551s |
| Bun (直接TS) | 0.555s | — | — | ~0.555s |

> 编译后的 JS 启动时间两者持平。Bun 直接跑 TS 源码也同样快，开发时可省去编译步骤。

### 测试速度

| 运行时 | 测试耗时 | 通过/失败 |
|--------|---------|----------|
| Bun    | **4.7s** | 588/2   |
| Node   | 10.7s   | 588/2   |

> Bun 跑测试快了 **2.3 倍**。

### 内存占用 (启动后稳态)

| 运行时 | RSS |
|--------|-----|
| Bun    | 374 MB |
| Node   | 393 MB |

> Bun 内存占用略低 (~5%)。

---

## 观察脚本使用说明

```bash
# 单次健康检查
./scripts/bun-migration/health-check.sh bun   # 或 node

# 完整对比基准测试 (3轮)
./scripts/bun-migration/compare-runtimes.sh 3

# 长时间稳定性观察（后台跑，每 60s 检查一次，跑 1 小时）
nohup ./scripts/bun-migration/watch-stability.sh 60 3600 &

# 持续观察直到手动停止
nohup ./scripts/bun-migration/watch-stability.sh 60 0 &
# 停止: kill %1 或 kill <PID>
```

所有报告输出到 `/tmp/bun-*` 文件，不需要人工盯。

---

## 回滚方案

如迁移失败，直接切回 `dev` 分支即可，所有变更隔离在 `feature/bun-migration` 分支。
生产部署只需将 `bun` 改回 `node` 即可回滚。

## 结论

**Bun 迁移可行**。所有核心组件兼容，无需代码层面修改。主要收益在测试速度（2.3x）和开发体验（跳过编译）。启动时间和内存差异不大。建议在 dev 环境用 `watch-stability.sh` 跑 24-48 小时观察后，再决定是否合入主分支。
