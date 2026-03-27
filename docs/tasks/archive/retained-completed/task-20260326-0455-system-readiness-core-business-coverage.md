# System Readiness Core Business Coverage

## Metadata

- Scope: restore core legacy business menus/pages for `base/*`, `entry/*`, `take/*`, and `stock/*` against current NestJS contracts, including the final `stock/interval` residual
- Related requirement: `docs/requirements/archive/retained-completed/req-20260325-2319-system-readiness-validation.md`
- Status: `completed`
- Review status: `parent-validated`
- Lifecycle disposition: `retained-completed`
- Last updated: `2026-03-26`

## Summary

- Restored backend RBAC route tree and frontend route/menu surfacing so `admin` can see and enter `基础数据`、`入库管理`、`领料管理`、`库存管理`.
- Added deliberate legacy permission aliasing and API compatibility adapters for `base/*`, `entry/*`, `take/*`, `stock/{inventory,log,used,scrap*,interval}`.
- Fixed the previously open important issues in main query flows by pushing `entry/order`, `take/pickOrder`, and `stock/log` filters to the current backend contract, and by removing `stock/inventory` hard truncation via full-page fetch then local aggregation.
- Closed the final `stock/interval` residual by limiting the UI filter to the only supported document type, keeping default/filtered read paths on `/api/inventory/factory-number-reservations`, and applying workshop-scope enforcement to interval list/detail reads.

## Validation

- `pnpm exec biome check` on touched backend/frontend files — passed; `stock/interval` view still reports template-usage warnings only from static analysis, with no blocking lint errors
- `pnpm swagger:metadata && pnpm typecheck` — passed
- `pnpm --dir web build:prod` — passed
- Browser validation — passed for `base/material`, `base/customer`, `base/supplier`, `base/personnel`, `base/workshop`, `entry/order`, `entry/detail`, `entry/intoOrder`, `entry/intoDetail`, `take/pickOrder`, `take/pickDetail`, `take/returnOrder`, `take/returnDetail`, `stock/inventory`, `stock/log`, `stock/used`, `stock/scrapOrder`, `stock/scrapDetail`, `stock/interval`
- Targeted browser regression checks — passed:
  - `entry/order` with `物料名称 = NO_SUCH_MATERIAL_123456` → `GET /api/inbound/orders?materialName=...` returned `200` and empty result
  - `take/pickOrder` with `物料名称 = NO_SUCH_MATERIAL_123456` → `GET /api/workshop-material/pick-orders?materialName=...` returned `200` and empty result
  - `stock/log` with `单据编号 = NO_SUCH_DOC_123456` → `GET /api/inventory/logs?businessDocumentNumber=...` returned `200` and empty result
  - `stock/inventory` with `规格型号 = NO_SUCH_SPEC_123456` → page returned empty result successfully
  - `stock/interval` default read → `GET /api/inventory/factory-number-reservations?limit=30&offset=0` returned `200`
  - `stock/interval` supported filter read → `GET /api/inventory/factory-number-reservations?businessDocumentType=CustomerStockOrder&limit=30&offset=0` returned `200`

## Outcome

- The scoped core business coverage is complete for the current readiness pass.
- Remaining items are non-blocking only: some legacy write actions remain intentionally hidden where current NestJS does not expose a stable command surface; `stock/inventory` `规格型号` filtering remains client-side after a full summary fetch and may become slow under much larger datasets; navbar websocket warnings are still noisy but do not block the validated pages.
- A final reviewer rerun was attempted but unavailable due external tool billing/access failure; closure therefore relies on previously surfaced reviewer findings having been fixed plus the successful type/build/browser evidence recorded above.
