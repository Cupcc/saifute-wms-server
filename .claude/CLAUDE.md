# Saifute WMS NestJS — Agent Guidelines

## Workspace aggrements

prefer `rg`

## 项目简介

WMS 仓储管理系统 NestJS 后端，采用模块化分层架构（controllers / application / domain / infrastructure / dto）。运行时 Bun，ORM Prisma，测试 Jest。

## 必读文档

写代码前，先 Read 对应文档：

- **架构总览** — `docs/architecture/00-architecture-overview.md`（模块地图、依赖方向、分层约定）
- **代码质量基线** — `docs/architecture/40-code-quality-governance.md`（分层纪律、模块边界、体积阈值、复杂度控制）
- **NestJS 最佳实践** — `.agents/skills/nestjs-best-practices/SKILL.md`（40 条规则索引，需要代码示例时再看 `AGENTS.md`）
- **模块文档** — `docs/architecture/modules/<module>.md`（改哪个模块就读哪个）

## PostToolUse Hook

`.claude/settings.json` 配置了自动检查——Edit/Write `.ts` 文件后会运行 `scripts/check-quality-hooks.mjs`，违规时 stderr 会给出修复指引。
