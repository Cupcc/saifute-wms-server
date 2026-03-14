# `file-storage` 模块设计

## 模块目标与职责

负责本地文件上传、下载、头像管理、资源 URL 生成和静态资源映射，第一阶段保持与原系统一致的本地磁盘方案。

## 原 Java 来源与映射范围

- `ruoyi-admin/.../CommonController.java`
- `ruoyi-admin/.../SysProfileController.java`
- `ruoyi-common/.../FileUploadUtils.java`
- `ruoyi-common/.../FileUtils.java`
- `ruoyi-common/.../RuoYiConfig.java`
- `ruoyi-framework/.../ResourcesConfig.java`
- `ruoyi-framework/.../ServerConfig.java`

## 领域对象与核心用例

核心对象：

- `StoredFile`
- `AvatarFile`
- `DownloadTicket`

核心用例：

- 普通文件上传
- 头像上传与替换
- 文件下载
- URL 与相对路径转换
- 本地目录资源映射

## Controller 接口草案

- `POST /files/upload`
- `POST /files/avatar`
- `GET /files/download`
- `GET /profile/*`

说明：

- `/profile/**` 保持匿名可访问语义，用于兼容历史附件 URL

## Application 层编排

- `UploadFileUseCase`
- `UploadAvatarUseCase`
- `DownloadFileUseCase`
- `BuildPublicUrlUseCase`

## Domain 规则与约束

- 文件大小、后缀、原文件名长度需校验
- 下载必须防路径穿越
- 头像替换时需处理旧文件清理
- 不以附件表主键作为外部引用，优先返回兼容路径与 URL

## Infrastructure 设计

- 本地根目录配置化，如 `upload.rootPath`
- 目录约定兼容：`upload`、`avatar`、`download`
- 使用 NestJS 静态资源映射暴露 `/profile/**`
- 文件元信息第一阶段不单独落表

## 与其他模块的依赖关系

- 被 `auth`、`rbac` 的头像能力依赖
- 被业务导入导出接口依赖
- 审计上传下载行为可接入 `audit-log`

## 事务边界与一致性要求

- 文件写盘与数据库引用不是强事务，需提供失败补偿策略
- 头像替换若数据库更新失败，应保留可清理的孤儿文件线索

## 权限点、数据权限、审计要求

- 上传与头像修改需要登录
- 公共访问路径默认匿名
- 下载行为和头像变更应记录操作审计

## 待补测试清单

- 上传大小和后缀校验测试
- 路径穿越防护测试
- 头像替换与旧文件清理测试
- 历史 URL 兼容测试

## 暂不实现范围

- 对象存储
- 附件元数据中心
- 私有文件签名下载
