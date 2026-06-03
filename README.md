# Saifute WMS NestJS

Saifute WMS NestJS 是赛福特仓储管理系统的 NestJS 迁移仓库，当前同时承载后端服务、前端管理端、数据库模型、历史数据迁移脚本、架构文档、需求文档和任务交付记录。

本仓库的核心目标是把旧 Java / RuoYi 系统迁移为 Bun + NestJS + Prisma + MySQL/MariaDB + Redis 的模块化 WMS 服务，并保留可追溯的业务单据、库存价格层、审核、权限和历史数据迁移链路。

## 技术栈

- 后端：Bun、TypeScript、NestJS、Prisma、MySQL/MariaDB、Redis、Jest、Biome
- 前端：Vue 3、Vite、Element Plus、Pinia
- 文档：`docs/requirements`、`docs/architecture`、`docs/tasks`、`docs/acceptance-tests`
- 质量门禁：Husky、lint-staged、commitlint、typecheck、Jest

## 目录结构

```text
.
├── src/                         # NestJS 后端源码
│   ├── modules/                 # 业务模块与平台模块
│   └── shared/                  # 共享配置、Prisma、Redis、守卫、拦截器等
├── prisma/                      # Prisma schema 与种子数据
├── scripts/                     # 迁移、开发、知识检索等脚本
├── test/                        # e2e 与迁移相关测试
├── web/                         # Vue 3 前端工程
└── docs/                        # 需求、架构、任务、验收、playbook 文档
```

## 前置环境

- Bun `>= 1.3.11`
- pnpm `>= 10.15.1`（仅 `web/` 前端工程需要）
- MySQL `>= 8.0`
- Redis `>= 7.0`

仓库根目录以 Bun 为主要脚本入口；`web/` 前端工程保留 pnpm 包管理约定。

## 快速启动

### 1. 安装依赖

```bash
bun install
```

如果只维护前端，也可以进入 `web/` 单独安装：

```bash
pnpm --dir web install
```

### 2. 配置环境变量

```bash
cp .env.example .env.dev
```

然后按本地环境修改 `.env.dev` 中的连接信息：

- `DATABASE_URL`：NestJS 目标库
- `LEGACY_DATABASE_URL`：旧系统来源库，仅迁移脚本使用
- `REDIS_HOST` / `REDIS_PORT`：Redis 连接
- `PORT`：后端服务端口，默认 `3000`

`.env.example` 以生产安全默认值为主。本地开发建议把 `.env.dev` 中的 `NODE_ENV` 改为 `development`，需要本地 Swagger 时再设置 `SWAGGER_ENABLED=true`。

不要把真实账号、密码、生产库连接或敏感环境变量提交到仓库。

### 3. 启动后端

```bash
bun run dev
```

该命令会先执行 `prisma:generate`，再通过 NestJS watch 模式启动服务。默认 API 全局前缀为 `/api`。

如果启用了 Swagger，可访问：

```text
http://localhost:3000/api/docs
```

### 4. 启动前端

```bash
bun run dev:web
```

前端工程位于 `web/`，更多前端说明见 `web/README.md`。

## 常用命令

### 后端

```bash
bun run dev                 # 本地开发启动
bun run build               # 构建后端
bun run build:prod          # 使用 .env.prod 生成 Prisma Client 并构建后端
bun run start               # 启动已构建产物
bun run start:prod          # 使用 .env.prod 启动已构建后端
bun run typecheck           # TypeScript 类型检查
bun run test                # Jest 测试
bun run verify              # typecheck + test
bun run lint                # Biome 检查
bun run format              # Biome 自动修复
bun run prisma:generate     # 生成 Prisma Client
bun run prisma:validate     # 校验 Prisma schema
```

### 前端

```bash
bun --cwd web dev           # 前端开发服务
bun --cwd web build:stage   # staging 构建
bun --cwd web build:prod    # production 构建
```

## 生产部署

后端生产环境建议使用独立的 `.env.prod`：

```bash
cp .env.example .env.prod
bun install
bun run build:prod
bun run start:prod
```

`bun install` 默认会安装 `dependencies` 和 `devDependencies`，构建阶段需要完整依赖来执行 Prisma Client 生成和 NestJS 编译。

部署前必须替换 `.env.prod` 中的占位值，重点确认：

- `NODE_ENV=production`
- `DATABASE_URL` 指向生产目标库
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` 指向生产 Redis
- `JWT_SECRET` 和 `JWT_REFRESH_SECRET` 使用不同的强随机值
- `SWAGGER_ENABLED=false`，如需开放文档应只放在可信内网
- `FILE_STORAGE_ROOT_PATH`、`LOG_DIR`、`DATABASE_BACKUP_DIR` 指向生产服务器上的持久化目录
- 反向代理后面部署时按实际代理层数设置 `HTTP_TRUST_PROXY`

前端生产构建使用 `web/.env.production`，当前 `VITE_APP_BASE_API=/prod-api`。如果通过 Nginx 部署，需要把 `/prod-api/` 反向代理到后端服务根路径，使前端请求 `/prod-api/api/...` 到达后端 `/api/...`，文件访问 `/prod-api/profile/...` 到达后端 `/profile/...`。

### 文档检索

```bash
bun run docs:search -- --query "库存价格层"
```

## 模块边界

主要业务模块位于 `src/modules/`：

- `inventory-core`：库存现值、库存日志、来源追踪和价格层，库存写入的唯一入口
- `approval`：审核记录与单据审核状态收口
- `inbound`：入库家族
- `sales`：销售出库与销售退货家族
- `workshop-material`：车间领料、退料、报废等
- `rd-project`：研发项目物料动作和项目台账
- `sales-project`：销售项目维度视图与统计
- `master-data`：物料、客户、供应商、人员、车间等主数据
- `reporting`：首页统计和跨域报表
- `auth`、`session`、`rbac`、`audit-log`、`system-management`：认证、会话、权限和系统管理

模块内推荐分层：

```text
controllers -> application -> infrastructure
domain      -> application
dto         -> controllers / application
```

`application` 层不直接依赖 Prisma Client 或 `PrismaService`；数据访问应通过 `infrastructure` 层 repository 收口。

## 历史数据迁移

迁移脚本统一通过 `.env.dev` 读取数据库连接。常见变量语义：

- `LEGACY_DATABASE_URL`：旧 Java / RuoYi 来源库
- `DATABASE_URL`：NestJS 目标库

迁移默认先 dry-run，再 execute，最后 validate。不要跳过预演和验证。

```bash
bun run migration:preflight
bun run migration:master-data:dry-run
bun run migration:master-data:execute
bun run migration:master-data:validate
```

库存价格层重建使用 inventory replay：

```bash
bun run migration:inventory-replay:dry-run
bun run migration:inventory-replay:execute
bun run migration:inventory-replay:validate
```

迁移、回填、重放类任务会写入目标库。执行前必须确认 `.env.dev` 指向的是预期目标。

## 文档入口

建议按下面顺序查阅：

1. `docs/requirements/PROJECT_REQUIREMENTS.md`：项目级业务总纲
2. `docs/requirements/REQUIREMENT_CENTER.md`：需求条目总览
3. `docs/architecture/00-architecture-overview.md`：架构总览和模块边界
4. `docs/architecture/20-wms-database-tables-and-schema.md`：数据库表与业务语义基线
5. `docs/architecture/30-java-to-nestjs-data-migration-reference.md`：旧系统到 NestJS 的迁移参考
6. `docs/architecture/40-code-quality-governance.md`：代码治理规则
7. `docs/tasks/TASK_CENTER.md`：当前任务与历史任务索引
8. `docs/acceptance-tests/README.md`：验收测试说明

长期业务事实写入 `docs/requirements/**`，稳定架构事实写入 `docs/architecture/**`，单次交付计划和执行记录写入 `docs/tasks/**`。

## 开发与提交约定

本仓库采用 main-only + 线性历史协作模型：

- 从最新 `origin/main` 创建短生命周期分支
- 提交信息使用 Conventional Commits，例如 `fix(auth): handle expired session`
- PR 合并到 `main` 时保持 rebase merge，不使用 merge commit
- 推送前本地 hook 会执行 Prisma Client 生成、类型检查和测试

常用发布前检查：

```bash
git diff --check
bun run verify
bun --cwd web build:prod
```

前端无关改动可以不跑前端构建；涉及 `web/` 的改动应至少跑一次对应构建。

## 安全注意事项

- 不要提交 `.env.dev` 中的真实数据库、Redis、JWT 或第三方密钥
- 不要直接在生产库上运行迁移 execute 命令
- 数据修复、库存重放、历史回填必须保留 dry-run 报告和验证结果
- 库存写入应通过 `inventory-core`，不要在业务模块中绕过库存核心写表
- 需求、架构和任务文档有明确分层，不要把一次性执行日志写进架构真源
