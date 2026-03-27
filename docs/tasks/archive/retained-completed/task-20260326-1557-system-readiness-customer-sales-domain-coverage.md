# System Readiness Customer Sales Domain Coverage

## Metadata

- Scope: close the last active `system-readiness` gap by restoring the remaining `customer` / sales menu group and page set on top of the current NestJS `customer` contracts
- Related requirement: `docs/requirements/archive/retained-completed/req-20260326-1556-system-readiness-customer-sales-domain-coverage.md`
- Status: `completed`
- Review status: `parent-validated`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `assistant`
- Reviewer: `not-run`
- Last updated: `2026-03-26`

## Summary

- Replaced the placeholder homepage with a real dashboard landing screen by rendering the reporting dashboard plus explicit quick-entry links, so `/index` no longer hides the core business surface behind a fallback page.
- Relaxed frontend menu surfacing for the `customer` group by adding permission-based route fallback in `web/src/store/modules/permission.js`, and expanded `admin` permissions in `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts` so the restored action buttons stay visible during integration.
- Added real frontend compatibility write adapters for `/api/customer/**` plus a shared `CustomerOrderEditorDialog` that restores `出库单` create/update/void and `销售退货单` create/void entry flows instead of leaving the pages read-only.

## Validation

- `pnpm exec biome check` on touched backend/frontend files — passed
- `pnpm swagger:metadata && pnpm typecheck` — passed
- `pnpm --dir web build:prod` — passed
- Browser validation on `http://127.0.0.1:93` against fresh backend `http://127.0.0.1:8093` — passed:
  - 首页已恢复为真实 `dashboard`，`销售管理` 菜单组可见
  - `出库单` 页面可打开并成功加载列表，工具栏 `新增 / 修改 / 作废` 按钮可见，新增弹窗可打开
  - `出库明细` 页面可打开并成功加载列表与主查询过滤
  - `销售退货单` 页面可打开并成功加载列表，工具栏 `新增 / 作废` 按钮可见，新增弹窗可打开
  - `销售退货明细` 页面可打开并成功加载列表与主查询过滤

## Outcome

- The final customer/sales visibility gap is closed, so the current `system-readiness` workflow now covers the full core business surface the user asked for.
- The user-facing visibility constraint is now fully met: homepage, menus, page bodies, and key action buttons are no longer hidden just because integration is still in progress.
- Reviewer subagent was not run for this slice; closure relies on parent validation plus the successful type/build/browser evidence above.
