# Summary

## Recommended Semantic Split

- `rdProject` / `研发项目`: internal RD runtime with real RD_SUB inventory movements.
- `salesProject` / `销售项目`: external large-sales project semantic; currently documented but not implemented as an inventory-writing module.
- `customer`: keep as the canonical customer outbound / sales-return module name; do not rename it while renaming sales-project semantics.

## Failure Modes To Avoid

- Renaming generic FIFO/source-allocation terminology that is unrelated to project semantics.
- Leaving old truth-source paths such as `docs/requirements/domain/project-management.md` in current docs or archived references.
- Updating docs only while schema/migration scripts still target legacy `project*` RD tables.
