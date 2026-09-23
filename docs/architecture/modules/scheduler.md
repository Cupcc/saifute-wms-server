# `scheduler` 模块设计

## 模块目标与职责

负责数据库驱动的任务定义、任务注册、暂停恢复、立即执行和执行日志，提供完整的任务定义、调度和执行能力。


## 领域对象与核心用例

核心对象：

- `ScheduledJob`
- `ScheduledJobLog`
- `JobInvokeTarget`

核心用例：

- 新增、修改、删除任务
- 启停任务
- 应用启动时按数据库任务全量注册
- 立即执行指定任务
- 记录执行日志、成功失败状态和耗时

## Controller 接口草案

- `GET /scheduler/jobs`
- `POST /scheduler/jobs`
- `PATCH /scheduler/jobs/:id`
- `POST /scheduler/jobs/:id/run`
- `POST /scheduler/jobs/:id/pause`
- `POST /scheduler/jobs/:id/resume`
- `GET /scheduler/job-logs`

## Application 层编排

- `RegisterAllJobsOnBootstrap`
- `SaveJobDefinitionUseCase`
- `PauseJobUseCase`
- `ResumeJobUseCase`
- `RunJobImmediatelyUseCase`
- `WriteJobLogUseCase`

## Domain 规则与约束

- 任务定义以数据库为准，进程重启后必须重建调度器状态
- `invokeTarget` 协议第一阶段保持兼容，不随意改格式
- 并发执行策略、misfire 策略和状态值保持当前系统一致
- 任务执行异常必须写日志，不能静默吞掉

## Infrastructure 设计

- 第一阶段可用 `@nestjs/schedule` 或等价调度器实现
- 任务元数据和日志表继续保留数据库存储
- 执行器注册采用白名单映射，不直接开放任意方法反射
- 长远如需多实例唯一执行，再补分布式锁

## 与其他模块的依赖关系

- 依赖 `audit-log` 记录任务管理操作
- 可调用其他业务模块公开应用服务，但禁止直接侵入其仓储层

## 事务边界与一致性要求

- 保存任务定义和调度注册要么同成功，要么回滚
- 任务执行日志与业务执行允许最终一致，但必须保证失败可追踪

## 权限点、数据权限、审计要求

- 任务管理接口需要系统权限
- 日志查询需要系统权限
- 任务定义变更和立即执行要记录操作审计

## 待补测试清单

- 启动重建任务测试
- 暂停/恢复任务测试
- 立即执行任务测试
- 失败日志写入测试
- 非法 `invokeTarget` 拦截测试

## 暂不实现范围

- 分布式调度协调
- BullMQ 替换
- 动态脚本任务
