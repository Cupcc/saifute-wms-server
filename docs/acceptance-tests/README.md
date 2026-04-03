# 验收测试文档

## 结构

```text
docs/acceptance-tests/
├── README.md
├── specs/            ← 按模块一个文件，长期维护
│   ├── _template.md
│   └── {module}.md
├── cases/            ← 可选，未代码化的 case 用 JSON
│   └── {module}.json
└── runs/             ← 可选，仅需冻结快照/审计时创建
    └── run-YYYYMMDD-HHMM-{scope}.md
```

## 核心约定

- **Spec 按模块组织**：每个模块一个文件（如 `master-data.md`），模块内每个能力（F1/F2/…）一个 section
- **AC 矩阵是核心**：每个 AC 一行，结论用 `met | partially-met | not-met | blocked`
- **不重复代码**：已代码化的 case 不在文档里重复步骤，只在证据索引里指向测试文件
- **未代码化的 case** 用 `cases/{module}.json` 记录（如 browser smoke）
- **环境默认** `.env.dev`，与 `pnpm dev` 对齐
- **Run 是可选项**：仅在需要冻结基线、保留复杂阻塞证据或满足审计要求时创建

## 本地 QA 与 `.env.dev`

- 验收、手工联调、浏览器验证、以及需要连本机 MySQL / Redis 的自动化步骤，默认与 `pnpm dev` 对齐，使用仓库根目录的 `.env.dev`。
- 启动后端时，`pnpm dev` 已带 `--env-file .env.dev`，无需重复指定。
- 对不会自动加载 env 文件的命令，必须显式注入 `.env.dev` 再执行。在 bash 或 zsh 下，使用 `set -a && source .env.dev && set +a && <command>`，或使用等价的显式 env-file 机制。
- 需要 `dotenv` 的脚本，优先使用与仓库脚本一致的方式，例如 `cross-env DOTENV_CONFIG_PATH=.env.dev ...`。
- 在验收记录中写明实际使用的 env 文件；不要把“未显式注入环境时的默认行为”当成可签收结果。
- 对登录、验证码等受开关影响的流程，先确认是否已按 `.env.dev` 注入环境，再判断失败归因。否则容易把 `CAPTCHA_ENABLED` 的默认值误判成实现缺陷。
- 例外：部分 stub 型单测或 e2e 会故意 `env -u ...` 清空变量以验证默认路径，这类命令按测试自身意图执行，并在证据里标明覆盖了哪些变量。

## 结论词汇

| 类型 | 允许值 |
|------|--------|
| AC 结论 | `met` / `partially-met` / `not-met` / `blocked` |
| 验证结果 | `passed` / `partial` / `blocked` / `not-run` |
| 证据结果 | `pass` / `fail` / `blocked` |
