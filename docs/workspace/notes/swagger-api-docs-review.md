# Swagger / OpenAPI 契约治理指南

**version**: v1.1 | **domain**: API 契约治理 / NestJS Swagger | **status**: 治理指南

## 文档定位

本文档既保留 `2026-04-29` Swagger review 的事实依据，也作为后续 OpenAPI 契约治理的执行指南。

使用方式：

- “Review 依据”和“问题清单”用于说明为什么要治理，不能脱离这些事实单独做方案。
- “治理目标与结论”和“治理终态结构”定义治理完成后的目标形态，后续实现不得偏离这个方向。
- “治理阶段方案”和“OpenAPI 门禁检查清单”用于拆分 PR、验收交付物和逐步接入门禁。
- 若后续统计数字变化，更新本文档的基线和阶段进度，避免指南与真实系统漂移。

## 治理目标与结论

当前 Swagger 文档已经可以打开，也能列出大部分路由和请求 DTO，但还不能作为可靠的接口契约使用。主要问题不是 Swagger 入口配置，而是运行态响应包裹、跳过包裹、认证公开接口、文件上传下载、错误响应和响应 DTO 没有统一进入 OpenAPI 描述。

最影响使用的是两类：

- 文档里的响应结构经常与真实返回不一致，尤其是 `@SkipResponseEnvelope()` 的接口。
- 大多数成功响应只显示 `data: object`，无法让前端或第三方知道真实字段。

治理完成后的结果不应只是“Swagger UI 看起来更完整”，而应达到以下状态：

- 运行态规则与 OpenAPI 规则同源：`@Public()`、`@SkipResponseEnvelope()`、文件流返回、统一 envelope、统一错误响应都由同一套 metadata / helper 驱动。
- controller 只表达业务接口契约：业务标签、摘要、请求 DTO、响应 DTO 和少量标准 helper；不在每个接口手写复杂 schema。
- `src/app.setup.ts` 只负责 Swagger bootstrap 和全局策略编排，不再维护公开接口、跳过 envelope、文件响应等手工 path 列表。
- OpenAPI JSON 可以被前端或第三方用于生成 client；新增接口如果缺少核心契约，会被脚本或 CI 发现。
- 治理过程不改变业务返回结构；如果需要调整 HTTP status、envelope code 或响应字段，应单独作为业务契约变更评审。

一句话目标：把 Swagger 从“运行后临时修出来的调试文档”升级为“和运行态共享规则、可被 CI 验证、可生成客户端的 API 契约系统”。

## Review 依据

本次检查基于当前工作区运行中的服务：

- Swagger UI: `http://127.0.0.1:8112/api/docs`
- OpenAPI JSON: `http://127.0.0.1:8112/api/docs-json`
- OpenAPI 版本: `3.0.0`
- 生成结果: `179` 个 paths，`231` 个 operations，`66` 个 component schemas
- 代码入口: `src/app.setup.ts`

关键统计：

| 指标 | 结果 |
| --- | ---: |
| operation 总数 | 231 |
| 有显式 summary 的 operation | 0 |
| 空 response description 数 | 231 |
| 有 4xx/5xx response 的 operation | 0 |
| 被文档包裹为 `{ success, code, data }` 的 operation | 227 |
| `data` 只是泛型 object 的成功响应 | 223 |
| 缺少描述的 query 参数 | 231 / 273 |
| 缺少描述的 path 参数 | 98 / 98 |
| `POST/PUT/PATCH` 但没有 requestBody 的 operation | 49 |
| multipart/form-data 上传 operation | 0 |
| 空 `Object` schema 引用 | 16 |

## 已确认正常的部分

- `nest-cli.json` 已启用 `@nestjs/swagger/plugin`，并打开 `classValidatorShim` 和 `introspectComments`。
- `src/app.setup.ts` 已集中配置 `SwaggerModule.createDocument()` 和 `SwaggerModule.setup()`，文档入口随全局前缀挂在 `/api/docs`，JSON 挂在 `/api/docs-json`。
- 带 DTO 类型的请求体总体能生成 `$ref`，例如 `POST /api/master-data/materials` 的 body 指向 `CreateMaterialDto`。
- 大多数 query DTO 能从 `class-validator` 推导类型、必填性、枚举、最大长度、最小值。

## 治理终态结构

### 1. 单一契约来源

当前最大风险不是缺少某几个 decorator，而是运行态规则和文档规则分成两套维护：

- 运行态公开接口依赖 `@Public()` / `IS_PUBLIC_KEY`。
- Swagger 公开接口依赖 `PUBLIC_SWAGGER_OPERATIONS` 手工列表。
- 运行态跳过响应包裹依赖 `@SkipResponseEnvelope()` / `SKIP_RESPONSE_ENVELOPE_KEY`。
- Swagger 跳过响应包裹依赖 `SKIP_RESPONSE_ENVELOPE_SWAGGER_OPERATIONS` 手工列表。

治理终态必须移除这种双轨维护。后续实现应把 `@Public()`、`@SkipResponseEnvelope()`、文件上传/下载、统一错误响应和统一 envelope 都纳入同一套契约 helper 或 metadata 扫描流程。手工 path 列表只能作为过渡方案，不应继续扩大。

### 2. 推荐分层

建议把 Swagger 契约能力集中放在共享层，避免散落到各业务模块：

```text
src/shared/api-docs/
  decorators/
    api-envelope-response.decorator.ts
    api-error-responses.decorator.ts
    api-file-response.decorator.ts
    api-multipart-file.decorator.ts
    api-public-route.decorator.ts
    api-skip-envelope.decorator.ts
  dto/
    api-error-response.dto.ts
    response-envelope.dto.ts
  openapi/
    apply-openapi-contract-policies.ts
    openapi-contract-audit.ts
```

职责边界：

- `decorators/` 提供 controller 可直接使用的组合 decorator，隐藏 OpenAPI schema 细节。
- `dto/` 放统一 envelope、错误响应、分页响应等可复用契约 DTO。
- `openapi/` 放 `SwaggerModule.createDocument()` 后的全局策略补齐和审计逻辑，例如公开接口 security、全局错误响应、contract 指标扫描。
- 业务模块只维护自己的请求 DTO、响应 DTO、业务 tags 和 summary。

如果实际落地时不新增 `src/shared/api-docs/` 目录，也必须保持同等边界：Swagger 契约 helper 只能集中在共享层，不能在每个业务 controller 里复制 schema 拼装逻辑。

### 3. Controller 目标写法

治理后的 controller 应接近下面这种形态：

```ts
@ApiTags("认证")
@Controller("auth")
export class AuthController {
  @Public()
  @ApiOperation({ summary: "账号密码登录" })
  @ApiEnvelopeOkResponse(AuthLoginResponseDto)
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

关键点：

- `@Public()` 既影响 guard，也能被 OpenAPI 策略识别为 `security: []`。
- `@ApiEnvelopeOkResponse(AuthLoginResponseDto)` 负责统一 `{ success, code, data }` schema，不让 controller 手写 envelope。
- 响应 DTO 表示外部契约，service 内部可以继续使用更贴近业务或数据库的结构。
- 上传、下载、分页、错误响应等都用标准 helper 表达，不在接口里手写重复 schema。

### 4. `app.setup.ts` 目标职责

`src/app.setup.ts` 的终态职责应收敛为：

1. 创建基础 Swagger config。
2. 调用 `SwaggerModule.createDocument()`。
3. 调用集中式 OpenAPI contract policy 后处理。
4. 挂载 Swagger UI 和 JSON。

不应长期保留的内容：

- `PUBLIC_SWAGGER_OPERATIONS` 这类公开接口 path 手工表。
- `SKIP_RESPONSE_ENVELOPE_SWAGGER_OPERATIONS` 这类 no-envelope path 手工表。
- 依靠“猜测空 schema”把所有成功响应包成 `data: object` 的兜底逻辑。

允许保留的内容：

- 全局 title、version、bearer auth、UI options。
- 少量全局兜底策略，例如为未声明错误响应的接口补统一错误 schema。
- 审计辅助逻辑，但审计失败应输出具体 path + method。

### 5. 明确反模式

后续治理应避免以下做法：

- 只把 `auth/refresh` 加进 `PUBLIC_SWAGGER_OPERATIONS`，但不解决 `@Public()` 与 Swagger 双轨维护。
- 继续往 `SKIP_RESPONSE_ENVELOPE_SWAGGER_OPERATIONS` 追加系统管理 export 路径。
- 在每个 controller 手写一份 envelope schema。
- 为了让 Swagger 好看而改变真实响应结构。
- 只补 summary / description，却不补响应 DTO，导致 OpenAPI 仍无法生成可靠 client。
- 新增扫描脚本只输出总数，不指出具体违规 operation。

## 问题清单

### P0: `@SkipResponseEnvelope()` 没有被 Swagger 响应包裹逻辑识别

证据：

- `ResponseEnvelopeInterceptor` 会读取 `SKIP_RESPONSE_ENVELOPE_KEY`，并在 class 或 method 上存在 `@SkipResponseEnvelope()` 时跳过响应包裹。
- `SystemUserController` 等系统管理 controller 在 class 级别标了 `@SkipResponseEnvelope()`。
- 但 `wrapSwaggerSuccessResponses()` 只使用 `SKIP_RESPONSE_ENVELOPE_SWAGGER_OPERATIONS` 这个手工列表，当前只跳过 4 个固定接口。
- 生成结果里仍有 `76` 个 `/api/system/*` operation 被文档包裹为 `{ success, code, data }`。

关联代码：

- `src/shared/common/interceptors/response-envelope.interceptor.ts:17`
- `src/modules/rbac/controllers/system-user.controller.ts:18`
- `src/app.setup.ts:45`
- `src/app.setup.ts:149`

影响：

- 文档显示系统管理接口返回统一 envelope，但真实接口不会被 `ResponseEnvelopeInterceptor` 包裹。
- 这会直接误导前端联调和基于 OpenAPI 的 client 生成。
- 导出类接口更严重，例如 `POST /api/system/user/export` 实际返回 `StreamableFile`，文档却显示 JSON envelope。

建议：

- 不要用手工路径列表维护 no-envelope 规则。
- 建议新增统一 Swagger 辅助 decorator，例如 `@ApiNoEnvelope()` 或让 `@SkipResponseEnvelope()` 组合写入 Swagger metadata。
- 如果继续后处理 OpenAPI JSON，需要让后处理读取 Nest 路由 metadata，而不是只匹配固定路径。

### P0: 成功响应的 `data` 基本没有真实结构

证据：

- `wrapSwaggerSuccessResponses()` 会把原始 success schema 放进 `data`。
- 如果 controller 没有显式 `@ApiOkResponse()` / `@ApiCreatedResponse()`，原始 schema 为空，最终 `data` 退化成 `{ type: "object" }`。
- 当前 `223` 个成功响应的 `data` 是泛型 object。
- 例如 `GET /api/rd-projects`、`POST /api/auth/login`、`GET /api/reporting/monthly-reporting` 的成功响应都只显示 `data: object`。

关联代码：

- `src/app.setup.ts:174`
- `src/app.setup.ts:230`
- `src/modules/rd-project/controllers/rd-project.controller.ts:34`
- `src/modules/auth/controllers/auth.controller.ts:20`

影响：

- Swagger UI 只能告诉调用者“有 data”，不能说明 data 里有什么字段。
- 前端不能可靠生成类型，第三方也无法按文档对接。
- 响应字段变更不会被 Swagger contract 暴露出来。

建议：

- 建立响应 DTO 和统一 helper，例如 `ApiEnvelopeOkResponse(UserProfileDto)`、`ApiEnvelopeArrayResponse(MaterialDto)`、`ApiPaginatedEnvelopeResponse(...)`。
- 优先补登录、当前用户、基础资料、入库、出库、报表等对前端最关键的接口。
- `wrapSwaggerSuccessResponses()` 不应把无 schema 的响应伪装成完整 contract；至少应在报告或测试里暴露 generic object 数量。

### P0: 文件上传接口缺少 multipart/form-data 文档

证据：

- `POST /api/files/upload` 和 `POST /api/files/avatar` 使用 `@UploadedFile()` 与 `ConfiguredFileInterceptor(...)`。
- 生成的 OpenAPI operation 没有 `requestBody`，也没有 `multipart/form-data` content。
- 当前生成结果中 multipart/form-data operation 数为 `0`。

关联代码：

- `src/modules/file-storage/controllers/file-storage.controller.ts:28`
- `src/modules/file-storage/controllers/file-storage.controller.ts:42`

影响：

- Swagger UI 不能正确展示文件选择框。
- 调用者看不出字段名分别是 `file` 和 `avatar`。
- 文件大小、允许扩展名、返回结构都不在文档中。

建议：

- 为上传接口补 `@ApiConsumes("multipart/form-data")`。
- 补 `@ApiBody({ schema: { type: "object", properties: { file/avatar: { type: "string", format: "binary" } } } })`。
- 补上传成功响应 DTO。

### P1: `auth/refresh` 实际公开，但 Swagger 仍显示需要 Bearer

证据：

- `AuthController.refresh()` 标了 `@Public()`。
- `PUBLIC_SWAGGER_OPERATIONS` 包含 `captcha`、`login`、`logout`，但漏了 `refresh`。
- 生成结果中 `POST /api/auth/refresh` 的 operation 没有 `security: []`，因此继承全局 `{ bearer: [] }`。

关联代码：

- `src/modules/auth/controllers/auth.controller.ts:26`
- `src/app.setup.ts:38`
- `src/app.setup.ts:104`

影响：

- Swagger UI 会把刷新 token 接口表现为需要 access token。
- 这与真实 guard 行为不一致，容易误导调试。

建议：

- 最小修复是把 `{ method: "post", path: "auth/refresh" }` 加入 `PUBLIC_SWAGGER_OPERATIONS`。
- 更稳的修复是把 `@Public()` 与 Swagger security override 合并，避免以后再漏同步。

### P1: 导出和下载接口缺少二进制 / 文件响应描述

证据：

- `GET /api/files/download`、`GET /api/reporting/export`、`POST /api/reporting/monthly-reporting/export` 已在手工列表中跳过 envelope。
- 生成响应只有空的 `200.description`，没有 `content`、`schema`、`format: binary`、`Content-Disposition` 说明。
- 系统管理下还有多组 export 接口返回 `StreamableFile`，但因为 class 级 `@SkipResponseEnvelope()` 没有进入 Swagger 后处理，文档反而显示 JSON envelope。

关联代码：

- `src/modules/file-storage/controllers/file-storage.controller.ts:60`
- `src/modules/reporting/controllers/reporting.controller.ts:152`
- `src/modules/reporting/controllers/reporting.controller.ts:182`
- `src/modules/rbac/controllers/system-user.controller.ts:31`

影响：

- 调用者无法从 Swagger 判断返回的是文件流还是 JSON。
- OpenAPI client 可能按 JSON 解析文件下载响应。

建议：

- 建立 `@ApiFileResponse(contentType?)` 辅助 decorator。
- 对所有 `StreamableFile` 接口显式写 `@ApiProduces(...)` 和二进制 schema。
- 将 export 接口从通用 envelope 后处理排除。

### P1: 没有任何错误响应文档

证据：

- 全局 `HttpExceptionFilter` 固定返回 `{ success: false, code, message }`。
- 全局 guard 和 validation pipe 会产生 `401`、`403`、`400` 等错误。
- 生成的 `231` 个 operation 中，`400`、`401`、`403`、`500` response 数量都是 `0`。

关联代码：

- `src/shared/common/filters/http-exception.filter.ts:10`
- `src/app.setup.ts:60`
- `src/app.setup.ts:68`

影响：

- 文档没有说明校验失败、未登录、无权限、服务异常的统一错误结构。
- 前端和第三方只能从代码或实际请求中猜错误格式。

建议：

- 定义 `ApiErrorResponseDto`。
- 在全局 Swagger 后处理或组合 decorator 中统一添加 `400`、`401`、`403`、`500`。
- 至少对需要登录的接口补 `401/403`，对有 DTO 的接口补 `400`。

### P1: Controller 没有业务摘要，文档可读性不足

证据：

- 当前 controller 中 `@ApiOperation` 数量为 `0`。
- 生成的 `231` 个 operation 都没有 `summary`。
- `231` 个 response description 都是空字符串。
- operation tags 由 `autoTagControllers` 从 class 名推导，例如 `SystemUser`、`RdProject`、`FileStorage`，没有中文业务分组说明。

关联代码：

- `src/app.setup.ts:98`
- `src/app.setup.ts:123`

影响：

- Swagger UI 只显示方法名和路径，缺少“做什么”的业务语义。
- 系统管理和业务模块混在英文类名标签下，非后端人员不容易使用。

建议：

- 为高频接口补 `@ApiOperation({ summary })`。
- 用 `@ApiTags("系统管理 - 用户")`、`@ApiTags("基础资料 - 物料")` 这类业务标签替换纯 class tag。
- 对导出、作废、审核、库存影响类接口补 response description。

### P2: 大量参数缺少中文说明

证据：

- `231 / 273` 个 query 参数没有 description。
- `98 / 98` 个 path 参数没有 description。
- `QueryRdProjectDto` 等 DTO 只有 validator，没有字段注释；而 `QueryInventorySummaryDto` 这类带 JSDoc 的 DTO 能生成中文 description。

关联代码：

- `nest-cli.json:10`
- `src/modules/rd-project/dto/query-rd-project.dto.ts:11`
- `src/modules/reporting/dto/query-reporting.dto.ts:40`

影响：

- 参数类型和校验规则存在，但业务含义不清楚。
- `id`、`actionId`、`dictIds`、`userIds` 这类 path 参数看不出是否支持逗号分隔、是否是主键、是否是业务编号。

建议：

- 对 DTO 字段补 JSDoc 或显式 `@ApiPropertyOptional({ description })`。
- 对 path 参数补 `@ApiParam({ name, description })`。
- 对逗号分隔 ID 参数单独说明格式。

### P2: 部分兼容接口使用 `Record<string, unknown>`，Swagger 无法生成请求体

证据：

- 当前有 `49` 个 `POST/PUT/PATCH` operation 没有 requestBody。
- 典型位置是系统管理 controller，方法参数大量使用 `Record<string, unknown>` 或 `Record<string, string | undefined>`。
- 例如 `PUT /api/system/user/profile`、`PUT /api/system/user/resetPwd`、`POST /api/system/user` 都没有 body schema。

关联代码：

- `src/modules/rbac/controllers/system-user.controller.ts:46`
- `src/modules/rbac/controllers/system-user.controller.ts:87`
- `src/modules/rbac/controllers/system-user.controller.ts:117`

影响：

- Swagger UI 不能展示这些接口需要提交哪些字段。
- 这类接口多数是系统管理页面直接依赖的兼容接口，联调成本高。

建议：

- 为系统管理接口补最小 DTO，即使底层 service 仍接收 `Record`。
- 如果短期不想重构 service，可只在 controller 参数层加 DTO，再转换成原来的 `Record`。

### P2: 部分枚举参数被生成为空 `Object` schema

证据：

- 生成的 OpenAPI JSON 中有 `16` 处参数 schema 引用了 `#/components/schemas/Object`。
- `components.schemas.Object` 实际是 `{ type: "object", properties: {} }`，没有枚举值。
- 典型例子是 `QueryInboundOrderDto.orderType` 使用 Prisma 生成的 `StockInOrderType`，并标了 `@IsEnum(StockInOrderType)`。
- `GET /api/inbound/orders`、`GET /api/inbound/into-orders`、`GET /api/sales/orders`、`GET /api/scheduler/jobs` 等参数存在类似问题。

关联代码：

- `src/modules/inbound/dto/query-inbound-order.dto.ts:10`
- `src/modules/inbound/dto/query-inbound-order.dto.ts:21`

影响：

- Swagger UI 看不到允许的枚举值。
- 调用方无法从文档判断合法入参，只能查代码或试错。

建议：

- 对 Prisma/generated enum 或 type-only enum 字段补显式 Swagger enum metadata。
- 可以封装本地 helper，避免到处重复 `@ApiPropertyOptional({ enum: ... })`。
- 把空 `Object` schema 引用数纳入 OpenAPI 质量检查，防止新增 DTO 继续退化。

### P2: HTTP 状态码与 envelope 内 `code` 示例不一致

证据：

- Nest 默认 `POST` 返回 HTTP `201`。
- 当前有 `64` 个 `POST/PUT/PATCH` operation 的 `201` response 里，envelope 内 `code.example` 仍是 `200`。
- `ResponseEnvelopeInterceptor` 也把成功 payload 的 `code` 固定写成 `200`。

关联代码：

- `src/shared/common/interceptors/response-envelope.interceptor.ts:47`
- `src/app.setup.ts:240`

影响：

- 文档同时表达 HTTP `201` 与业务 `code: 200`，调用方不清楚应以哪个状态为准。
- 如果业务规范要求统一 `code: 200`，应明确说明；如果不是，应让示例随 HTTP status 变化。

建议：

- 若业务层统一使用 `code: 200`，建议把 POST 成功 HTTP 状态显式改为 `200` 或在文档中明确约定。
- 若要保留 HTTP `201`，则 Swagger envelope builder 应按 status code 填示例。

## 治理路线总览

治理不是沿着 controller 一个个补注解，而是按“基线 -> 契约内核 -> 模块铺开 -> 可读性 -> 门禁化”的顺序推进：

1. 先固化基线：让 OpenAPI 质量问题可以被脚本重复扫描，并输出具体 path + method。
2. 再修契约内核：移除 `@Public()`、`@SkipResponseEnvelope()`、文件流、错误响应与 Swagger 的双轨维护。
3. 建立共享 helper：`ApiEnvelopeOkResponse`、`ApiEnvelopeCreatedResponse`、`ApiEnvelopeArrayResponse`、`ApiPaginatedEnvelopeResponse`、`ApiFileResponse`、`ApiMultipartFile`、`ApiErrorResponses`。
4. 选择 5 到 8 个关键模块先补响应 DTO：认证、当前用户、基础资料、入库、销售出库、车间领料、研发项目、报表。
5. 最后补摘要、参数说明和业务 tags，让 Swagger 从“能调用”提升到“能读懂、能生成、能对接”。

阶段顺序可以按 PR 拆分，但不能改变优先级：契约真实性优先于字段完整性，字段完整性优先于可读性润色。

## 治理阶段方案

### 阶段 0: 基线固化与度量脚本

目标：把本次 review 的人工统计固化为可重复执行的 OpenAPI 质量扫描，避免后续治理只靠人工打开 Swagger UI 判断。

交付物：

- 新增 OpenAPI 质量扫描脚本，输入 `/api/docs-json` 或本地生成的 OpenAPI JSON。
- 输出当前核心指标：operation 总数、公开接口 security、envelope 包裹数量、generic `data: object` 数量、multipart 数量、文件响应数量、错误响应覆盖数量、空 `Object` schema 引用数量、缺少 summary / description 的数量。
- 在 `package.json` 增加脚本入口，例如 `bun run lint:openapi` 或 `bun run audit:openapi`。

退出标准：

- 脚本能稳定复现本文档“关键统计”里的主要数字。
- 脚本失败输出必须指向具体 path + method，不能只给总数。
- 本阶段只做观测，不阻断 CI，避免在存量问题清零前影响正常发布。

不做：

- 不因为扫描脚本存在就立即接入阻断。
- 不在脚本里硬编码“当前 231 个 operation 这种固定数字”为通过条件；固定数字只作为基线快照，真正门禁应检查问题类别和新增问题。

### 阶段 1: 契约真实性修复

目标：优先消除“Swagger 文档和真实运行结果不一致”的问题。这个阶段不追求字段描述完整，而是先保证调用方不会被文档误导。

范围：

- 移除公开接口手工 path 列表，改为从 `@Public()` metadata 或组合 decorator 推导 Swagger `security: []`。
- 移除 no-envelope 手工 path 列表，改为从 `@SkipResponseEnvelope()` metadata、组合 decorator 或集中式 route metadata 扫描推导 OpenAPI 响应结构。
- 文件上传接口统一通过 `ApiMultipartFile` 类 helper 补 `multipart/form-data` requestBody。
- 文件下载、导出、`StreamableFile` 接口统一通过 `ApiFileResponse` 类 helper 补二进制响应，并排除 JSON envelope。
- 统一错误响应结构至少覆盖 `400`、`401`、`403`、`500` 的 schema。

退出标准：

- 文档中标记 no-envelope 的接口不再出现 `{ success, code, data }` 包裹。
- 所有 `@Public()` 接口的 OpenAPI operation 都有 `security: []`。
- 文件上传 operation 的 multipart 数量从 `0` 增加到实际上传接口数量。
- 文件下载和导出 operation 明确返回 `type: string, format: binary`。
- 非公开接口至少能看到统一 `401` 响应，有权限要求的接口至少能看到 `403`。

不做：

- 不接受只给 `PUBLIC_SWAGGER_OPERATIONS` 或 `SKIP_RESPONSE_ENVELOPE_SWAGGER_OPERATIONS` 追加路径作为最终修复。
- 不在业务 controller 中复制二进制响应、multipart、错误响应 schema。
- 不为了让 OpenAPI 通过而改动真实响应包裹规则。

### 阶段 2: Swagger Helper 与关键模块 DTO

目标：建立可复用的 decorator/helper，先把前端和第三方最常用的接口从 `data: object` 提升为可生成类型的契约。

范围：

- 新增统一 helper：`ApiEnvelopeOkResponse`、`ApiEnvelopeCreatedResponse`、`ApiEnvelopeArrayResponse`、`ApiPaginatedEnvelopeResponse`、`ApiFileResponse`、`ApiMultipartFile`、`ApiErrorResponses`。
- 优先补关键模块响应 DTO：认证、当前用户、基础资料、入库、销售出库、车间领料、研发项目、报表。
- 对兼容接口补 controller 层最小 DTO，底层 service 可继续接收现有 `Record` 入参。
- 对 Prisma enum / generated enum 参数补显式 Swagger enum metadata，消除空 `Object` schema。

退出标准：

- 关键模块的成功响应不再退化为泛型 `data: object`。
- 空 `Object` schema 引用数量降为 `0`，或每个剩余项都有明确豁免原因。
- 新增 helper 有集中测试或快照验证，避免 envelope schema、分页 schema、文件 schema 后续漂移。
- 业务代码不因为补 Swagger metadata 改变运行态返回结构。

不做：

- 不把 Prisma model 或数据库实体直接当作外部响应 DTO 暴露。
- 不用 `Record<string, unknown>` 继续充当 controller 边界契约。
- 不在多个模块里复制相同的 envelope、分页、错误响应 schema。

### 阶段 3: 可读性与覆盖面扩展

目标：把 Swagger 从“契约基本可信”提升为“可读、可联调、可生成”的接口文档。

范围：

- 为 controller 补业务化 `@ApiTags(...)`，替代纯 class 名标签。
- 为高频 operation 补 `@ApiOperation({ summary })`。
- 为 path 参数补 `@ApiParam`，特别是 `id`、`actionId`、`dictIds`、`userIds` 等容易误解的参数。
- 为 query DTO 字段补 JSDoc 或 `@ApiPropertyOptional({ description })`。
- 为导出、作废、审核、库存影响类接口补 response description，说明业务副作用。

退出标准：

- 关键模块 operation 的 summary 覆盖率达到 `100%`。
- path 参数 description 覆盖率达到 `100%`。
- query 参数 description 缺失数持续下降，并在后续 PR 中不得新增缺失项。
- Swagger UI 中业务分组能让非后端人员按模块定位接口。

不做：

- 不用 summary / description 掩盖缺失响应 DTO 的问题。
- 不引入和现有业务命名不一致的 tags；标签应按业务模块组织，而不是按技术类名组织。

### 阶段 4: 门禁化与长期治理

目标：将阶段 0 的扫描从审计工具升级为质量门禁，让新增接口默认带完整 Swagger 契约。

推进方式：

- 第一轮只在本地和 PR review 中提示，不阻断。
- 存量 P0/P1 清零后，将“文档与真实响应不一致”类检查接入 CI 阻断。
- 存量 P2 完成主要模块治理后，将“新增 generic `data: object`、新增空 `Object` schema、公开接口缺 security override”设为阻断。
- 每次 Swagger 相关治理 PR 都更新本文件的统计数字，形成趋势记录。

退出标准：

- CI 中存在稳定的 OpenAPI contract 检查。
- 新增 controller / DTO 如果缺少响应 schema、错误响应、公开接口 security 或文件上传/下载描述，会在 PR 阶段失败。
- `data: object`、缺 summary、缺参数 description 等指标有明确阈值，并且阈值只能收紧不能放宽。

### 阶段推进原则

- 先修真实性，再修完整性，最后修可读性。
- 先建 helper，再批量铺开，避免每个 controller 手写不同 schema。
- 每个阶段的 PR 应包含扫描结果对比，至少说明治理前后关键指标变化。
- Swagger 治理不应改变业务返回结构；如果确实需要调整 HTTP status 或 envelope code，应单独作为业务契约变更评审。
- 存量问题允许分阶段下降，但任何新接口不得扩大 P0/P1 问题面。

## PR 拆分建议

建议按以下 PR 边界推进，减少“大而全重构”风险，同时保证每一步都朝终态结构收敛：

| PR | 主题 | 必须交付 | 不应包含 |
| --- | --- | --- | --- |
| PR 1 | OpenAPI 基线审计 | `openapi-contract-audit` 脚本、当前统计快照、具体 path + method 输出 | 大量 controller 注解修改 |
| PR 2 | 契约内核与全局策略 | 共享 helper 目录、公开接口 / no-envelope metadata 驱动、文件响应 helper、错误响应 DTO | 批量补所有业务模块 DTO |
| PR 3 | 关键模块响应 DTO | 认证、当前用户、基础资料、入库、出库、报表等关键模块的响应 DTO 和 helper 应用 | 修改业务返回语义 |
| PR 4 | 兼容接口边界 DTO | 系统管理接口最小请求/响应 DTO，替代 controller 边界 `Record` | 重写底层 service 业务逻辑 |
| PR 5 | 可读性补齐 | 业务 tags、summary、path/query 参数说明、导出/审核/作废副作用说明 | 新增另一套 Swagger helper |
| PR 6 | 门禁接入 | 阈值策略、CI / pre-push 接入、趋势记录更新 | 一次性把所有历史 P2 问题设为阻断 |

每个 PR 的描述至少包含：

- 本次处理的阶段和范围。
- OpenAPI 扫描前后关键指标。
- 是否改变运行态响应结构；如果改变，说明业务契约评审结论。
- 剩余问题和下一阶段入口。

## OpenAPI 门禁检查清单

建议增加一个轻量脚本检查生成后的 OpenAPI JSON，至少覆盖：

- `@Public()` 接口不能继承全局 bearer security。
- 标记 `@SkipResponseEnvelope()` 的接口不能被包装成统一 envelope。
- 文件上传必须有 `multipart/form-data` requestBody。
- 文件下载和导出必须有二进制 response。
- 成功响应中 `data: object` 的数量应持续下降，避免新接口继续退化。
- 空 `Object` schema 引用数应为 0。
- 所有非公开接口应有 `401`，有权限要求的接口应有 `403`，有 DTO 的接口应有 `400`。

门禁分级：

- `error`：文档与真实响应不一致、新增公开接口缺 `security: []`、新增文件上传/下载缺 schema、新增 no-envelope 接口被包裹。
- `warn`：新增成功响应退化为 `data: object`、新增参数缺 description、新增 operation 缺 summary。
- `baseline`：存量问题保留统计和趋势，不在第一轮阻断；当某类存量清零后转为 `error`。
