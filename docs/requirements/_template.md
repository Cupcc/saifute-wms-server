# [切片需求标题]

> 本模板仅用于 `docs/requirements/req-*.md` 切片/任务级需求文档，不用于固定项目需求文档 `docs/requirements/PROJECT_REQUIREMENTS.md` 或主题需求文档 `docs/requirements/topics/*.md`。
>
> 这里只写本次切片需求、简洁进展和待确认事项；不要写项目长期需求、文档机制规则或详细执行计划。
>
> 如果你要新建主题需求，请改用 `docs/requirements/topics/_template.md`。

## Metadata

- ID:
- Status: `draft` | `confirmed` | `needs-confirmation`
- Lifecycle disposition: `active` | `retained-completed` | `cleanup-candidate`（非 `active` 时文件应在 `docs/requirements/archive/<bucket>/`）
- Owner:
- Topic requirement: （可选；若当前切片属于已有主题，填写 `docs/requirements/topics/*.md` 路径）
- Related tasks:（列出 `docs/tasks/**/*.md`，归档需求或归档 task 时同步更新路径）

## 用户需求

- [ ] 用简洁中文描述用户需求。

## 当前进展

- 阶段进度:
- 当前状态:
- 验收状态: `待验收` | `已跳过` | `验收通过` | `验收未通过` | `有条件通过` | `验收阻塞`
- 阻塞项:
- 下一步:

## 需求矩阵（可选）

- 仅当当前切片需要保留可复用的角色矩阵、状态矩阵、责任边界或架构基线时再添加本节。
- 如果没有这类稳定基线，本节删除即可，保持正文简洁。

## 待确认

- 记录 AI 的疑问、需要用户确认的问题、以及需要用户做决定的事项
- 如果没有待确定项，写 `None`

`当前进展` 面向用户保持简洁，只写关键阶段状态，不展开详细执行日志。  
`验收状态` 用于 requirement 级聚合结论，不承载详细测试步骤或浏览器执行记录。  
`待确认` 用于承载尚未定稿的需求边界与决策点；一旦用户已明确答复，应及时并回 `用户需求` 或 `当前进展`。  
如果该切片属于某个长期主题，优先把长期约束写入 `docs/requirements/topics/*.md`，当前文档只保留本次交付范围；但若某份已归档切片仍是后续工作反复引用的关键基线，可保留必要矩阵，不必为了“瘦身”强行删除。  
如果这是新建或刚修改且准备发给用户确认的需求文档，默认将 `Status` 设为 `needs-confirmation`；只有用户明确同意后，才能改为 `confirmed` 并进入规划或编码。  
如果只是同步 `当前进展`，且没有改写用户需求理解，可继续保持 `confirmed`。  
新建需求默认 `Lifecycle disposition` 为 `active`；闭环归档时改为 `retained-completed` 或 `cleanup-candidate` 并移动文件到 `docs/requirements/archive/<bucket>/`，同时更新关联 task 与 `REQUIREMENT_CENTER.md`。
