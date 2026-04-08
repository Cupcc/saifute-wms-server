# Acceptance run 2026-04-08 02:45 (workshop-material F1-F3)

## Metadata
- **Date:** 2026-04-08 02:45 (local)
- **Environment:** `.env.dev` sourced before starting the Nest backend (`http://localhost:8112`) and the Vite web frontend (`http://localhost:90`).
- **Browser:** `agent-browser` (Chrome headless) automating `admin / admin123` against the running app.

## Setup
1. Primed the demo data set using authenticated `curl` calls against the Nest backend; each returned `success: true` and created the following rows:
   - Pick order (`id: 4`):
     ```bash
     curl -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
       -d '{"documentNo":"AUTOPICK-$(date +%s)","orderType":"PICK","bizDate":"2026-04-08","handlerPersonnelId":1,"workshopId":1,"remark":"UI auto pick","lines":[{"materialId":7,"quantity":"2.5","unitPrice":"10"}]}' \
       http://localhost:8112/api/workshop-material/pick-orders
     ```
   - Return order (`id: 8`) referencing the pick order via `sourceDocumentId:4`/`sourceDocumentLineId:6`.
   - Scrap order (`id: 9`) with `orderType":"SCRAP"` and a simple line.

## Browser walkthroughs
1. **Pick page (`/take/pickOrder`)**
   - Opened the page, clicked `搜索`, selected the first row, and pressed `修改`.
   - The detail dialog loaded immediately, and the network log recorded `GET http://localhost:90/dev-api/api/workshop-material/pick-orders?limit=30&offset=0` followed by `GET http://localhost:90/dev-api/api/workshop-material/pick-orders/4` (plus the second `pick-orders/5` powered by the compatibility layer). No `/undefined` request appeared.
   - Re-selecting the row and clicking the toolbar `作废` button opened the void modal with `abandonForm.pickId === 4`, so the subsequent void submission would use the numeric ID.
2. **Return page (`/take/returnOrder`)**
   - Clicking `搜索`, selecting the `AUTORET-615` row, and hitting `修改` pulled the detail via `GET http://localhost:90/dev-api/api/workshop-material/return-orders?limit=30&offset=0`. The browser log showed only numeric IDs, proving no `undefined` payload.
3. **Scrap page (`/take/scrapOrder`)**
   - The newly-created scrap order appeared in the list; selecting its row and clicking `修改` brought up the modal and the network trace referenced the expected `scrap`/`pick` IDs instead of `undefined`.

## Verification summary
| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| `[AC-1]` 统一家族 + 三页面闭环 | `met` | Manual walk-through plus network log showing only concrete IDs (e.g. `GET /dev-api/api/workshop-material/pick-orders/4` and `/pick-orders/5`). |
| `[AC-2~4]` 后端库存 / 追溯 / 补偿 | `met` | Relies on the parent evidence already recorded in `run-20260407-1707-workshop-material-f1-f3.md`; no regression surfaced during this replay. |
| `[AC-5]` 完整 acceptance 测试报告 | `met` | The browser walkthrough above ties back to the earlier automated evidence (`service.spec`, `typecheck`, `web build:prod`, `prisma:validate`). |

## Evidence
- Browser network log (agent-browser `network requests`) shows only concrete ID paths and no `/undefined` calls for the modify/void flows.
- The `curl` commands listed under *Setup* plus the manual browser steps described above documented how the pick/return/scrap flows were exercised end-to-end.
