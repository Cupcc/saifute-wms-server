# 系统管理模块主题需求

## Metadata

- ID: `topic-system-management-module`
- Status: `confirmed`
- Scope: `topic-level`
- Owner: `user`

## 主题定义

- `system-management` 是平台层长期主题，解决“谁能登录、能看到什么、能操作什么、组织关系如何表达，以及哪些平台配置由系统统一维护”的问题。
- 当前真实组织口径已先收敛为 `研发部 / 采购部 / 仓库` 三个一级部门；当前系统使用者先按 `系统管理员 / 仓库管理员 / 研发小仓管理员 / 采购人员` 四类主角色设计，后续可能增加 `老板 / 财务` 两类偏查看角色。
- 当前运行态代表账号以 `admin / operator / rd-operator / procurement` 为主；其中 `operator` 保留兼容用户名，但业务语义已对齐为 `仓库管理员`，`system-manager / ai-operator` 不再作为长期主口径。
- 当前主题优先覆盖 `用户 / 角色 / 部门 / 菜单 / 字典 / 参数 / 通知` 这些核心系统管理对象；`岗位` 虽然在现有系统页中已存在，但当前真实业务口径里不是必选治理对象。
- 本文档只保留长期约束、能力清单、阶段路线图与文档关系；具体实现或修复仍应另开 `req-*.md` 切片。

## 长期约束

- `C1` 单一权限真源：`/api/auth/me`、`/api/auth/routes`、`PermissionsGuard`、前端动态菜单、按钮可见性、角色菜单关系与数据权限策略必须来自同一套系统管理真源，前后端不能各自维护一套解释。状态：`生效中`
- `C2` 会话真源统一：`JWT` 只作为会话索引，用户角色、权限、部门、`consoleMode` 等运行态真源仍在 `Redis session`；系统管理变更后必须能够解释会话刷新或失效策略。状态：`生效中`
- `C3` 平台层与业务层分离：`部门 / 角色 / 菜单 / 参数 / 通知` 属于平台治理对象，`岗位` 当前为可选兼容对象；这些平台对象都不应直接替代业务模块里的仓别、库存范围、项目归集等业务真源。状态：`生效中`
- `C4` 组织权限不等于库存范围：部门和角色可以影响菜单、页面与数据权限，但真实库存访问仍沿 `stockScope / workshopScope` 收口，不能把组织树直接当成库存边界。状态：`生效中`
- `C5` 新系统自建口径：旧 Java 平台的 `sys_user / sys_role / sys_menu / sys_dept / sys_post / sys_config / sys_notice / sys_dict_*` 不作为当前正式业务真源整表迁移，应按新系统方案重建。状态：`生效中`
- `C6` 初始化独立于业务迁移：系统管理初始化与业务数据迁移是两套 checklist；数据库 schema 初始化不等于系统管理 seed 初始化。状态：`生效中`
- `C7` 视角裁切不能替代授权：`consoleMode` 只负责壳层与默认入口体验，不负责替代权限判定；`admin` / 系统管理员不应因为视角裁切丢失本应可见页面。状态：`生效中`
- `C8` 超级管理员语义收敛：超级管理员语义必须在数据库、后端鉴权、会话快照和前端识别上端到端一致，不能出现多套互相漂移的“admin 判定”。状态：`生效中`
- `C9` 审计与失效策略：用户、角色、菜单和授权关系的关键变更需要保留审计能力，并在合理范围内触发会话刷新或失效，避免长期 stale permissions。状态：`生效中`
- `C10` 运行期表边界：`sys_job`、`sys_job_log`、`sys_logininfor`、`sys_oper_log` 保持运行期语义，不把它们误当作系统管理主数据真源。状态：`生效中`

## 长期业务口径

### 核心对象口径

- `用户管理` 负责账号、登录身份、部门归属、角色绑定、启停与密码重置；当前阶段不要求岗位必填。
- `角色管理` 负责一组权限与路由能力的打包，也负责数据权限范围的定义。
- `部门管理` 负责组织树与角色数据范围的组织边界；当前真实组织先按 `研发部 / 采购部 / 仓库` 三个一级部门建模，不直接代表真实库存仓别。
- `菜单管理` 负责页面、路由与按钮权限字符串的承接，是前端动态菜单与后端 `@Permissions()` 的共同锚点。
- `岗位管理` 当前仅作为系统已有兼容能力保留；若真实业务后续仍不需要岗位维度，可在后续切片中继续降权或弱化。
- `字典 / 参数 / 通知` 属于平台辅助配置，能承接通用枚举、少量系统参数与公告，但不宜继续承接核心业务事实。

### 当前角色设计口径

- 当前主角色先按 `系统管理员 / 仓库管理员 / 研发小仓管理员 / 采购人员` 设计，满足最小可用权限模型。
- 当前运行态代表账号按 `admin / operator / rd-operator / procurement` 维护；其中 `operator` 对齐 `仓库管理员`，`procurement` 对齐 `采购人员`。
- 当前建议版本 `V1`：
  - `系统管理员`：保留全量系统管理与跨域排障兜底能力
  - `仓库管理员`：负责主仓业务与公司级实物流转，并可查看 RD 协同必要信息
  - `研发小仓管理员`：负责 RD 小仓内部日常作业，只看 RD 视角与主仓协同结果
  - `采购人员`：负责采购执行链路，可回看与采购闭环有关的主仓验收结果
- 旧的 `system-manager / ai-operator` 仅保留历史溯源意义，不再作为当前长期主角色或代表账号基线。
- `老板` 与 `财务` 当前先视为后续可能增加的查看型角色；是否在这一轮 topic 下立即细化，仍待确认。
- 当前阶段优先靠“角色”表达系统使用者差异，不额外引入岗位层来增加治理复杂度。

### 邻接能力口径

- 当前建议把 `在线用户 / 登录日志 / 操作日志` 纳入 `system-management` 第一版长期 topic，因为它们天然属于平台治理、排障与审计能力。
- 当前建议暂不把 `调度任务 / AI 支持` 纳入 `system-management` 第一版长期 topic，避免主题膨胀；作为非核心平台邻接能力顺延到 Phase 3 规划，当前状态暂不执行。
- 若后续继续扩展 `system-management`，应优先围绕“组织与授权真源”“平台初始化与持久化方案”“系统运维能力边界”开新切片，而不是把业务域能力混入该 topic。

## 能力清单

| 编号   | 能力           | 验收口径                                                                                                      | 阶段      | 状态    | 关联需求                                                                                    |
| ---- | ------------ | --------------------------------------------------------------------------------------------------------- | ------- | ----- | --------------------------------------------------------------------------------------- |
| `F1` | 系统管理八类核心能力收口 | `用户 / 角色 / 部门 / 菜单 / 岗位 / 字典 / 参数 / 通知` 的前端 `/api/system/*` 与当前 NestJS 承接对齐，且 `admin` / 代表性非 `admin` 冒烟通过 | Phase 1 | `已完成` | `docs/requirements/archive/retained-completed/req-20260327-1604-rbac-implementation.md` |
| `F2` | 组织与角色矩阵澄清    | 明确真实部门、主角色、预留查看角色与账号维护职责，形成后续 system-management 切片的长期基线                                                   | Phase 2 | `已完成` | `docs/requirements/archive/retained-completed/req-20260331-0042-system-management-f2-f3-baseline.md` |
| `F3` | 平台审计与在线治理边界  | 明确 `在线用户 / 登录日志 / 操作日志` 在 system-management topic 下的长期归属与验收口径                                             | Phase 2 | `已完成` | `docs/requirements/archive/retained-completed/req-20260331-0042-system-management-f2-f3-baseline.md` |
| `F4` | 平台初始化与持久化方案  | 已完成当前 Prisma snapshot 持久化与菜单/角色数据驱动基线；若后续要继续拆成规范化平台表，应另开新的切片                                                                     | Phase 2 | `已完成` | `docs/requirements/archive/retained-completed/req-20260331-0934-system-management-f4-persistence.md` |
| `F5` | 系统运维邻接能力边界   | 明确 `调度 / AI 支持` 等非核心平台能力是否保持 topic 外邻接管理，并在 Phase 3 再决定是否开启独立切片                                                                  | Phase 3 | `未开始` | `-`                                                                                     |

## 阶段路线图

| 阶段      | 目标                                | 当前状态  |
| ------- | --------------------------------- | ----- |
| Phase 1 | 收口当前系统管理八类核心能力与 RBAC 基础闭环         | `已完成` |
| Phase 2 | 澄清真实组织矩阵、平台边界与后续实现主轴              | `进行中` |
| Phase 3 | 基于确认结果继续扩展 system-management 相关切片 | `待规划` |

## 已确认（当前）

- 已确认：真实部门当前为 `研发部 / 采购部 / 仓库` 三个一级部门，不需要二级部门。
- 已确认：当前系统使用者先按 `系统管理员 / 仓库管理员 / 研发小仓管理员 / 采购人员` 四类主角色设计；`老板 / 财务` 为后续可能增加的预留角色。
- 已确认：当前阶段岗位没有必要单独维护。
- AI 建议版本 `V1`：四类主角色先按“系统管理兜底 / 主仓作业 / RD 小仓作业 / 采购执行”分工。
- AI 建议：`老板 / 财务` 当前仅保留预留位，不进入这一轮必交付设计。
- AI 建议：`system-management` 第一版纳入 `在线用户 / 登录日志 / 操作日志`，`调度 / AI 支持` 作为非核心平台能力顺延到 Phase 3 规划，当前状态暂不执行。
- 已确认：`调度 / AI 支持` 当前继续维持 topic 外邻接关系，不在本阶段执行。
- 已确认：当前运行态代表账号以 `admin / operator / rd-operator / procurement` 为准，`operator` 的业务语义对齐 `仓库管理员`；旧 `system-manager / ai-operator` 不再作为主口径。
- 已确认：接受上述 `V1` 角色矩阵与 topic 范围建议，并据此继续对齐架构文档。

## 文档关系（可选）

- 项目级长期背景：`docs/requirements/PROJECT_REQUIREMENTS.md`
- 已归档阶段基线：
  - `docs/requirements/archive/retained-completed/req-20260327-1604-rbac-implementation.md`
  - `docs/requirements/archive/retained-completed/req-20260331-0042-system-management-f2-f3-baseline.md`
  - `docs/requirements/archive/retained-completed/req-20260331-0051-system-management-runtime-alignment.md`
- 已归档执行与验证：
  - `docs/tasks/archive/retained-completed/task-20260327-1721-rbac-system-management-closure.md`
  - `docs/tasks/archive/retained-completed/task-20260331-0042-system-management-f2-f3-baseline.md`
  - `docs/tasks/archive/retained-completed/task-20260331-0051-system-management-runtime-alignment.md`
- 已归档 workspace：
  - `docs/workspace/archive/retained-completed/system-management-module/README.md`
- 后续继续推进时，应从本 topic 新开 `docs/requirements/req-*.md` 切片。
