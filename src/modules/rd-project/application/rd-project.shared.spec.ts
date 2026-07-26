import { Prisma } from "../../../../generated/prisma/client";
import {
  buildRdProjectBomChanges,
  buildRdProjectHeaderChanges,
} from "./rd-project.shared";

describe("buildRdProjectHeaderChanges", () => {
  const base = {
    projectCode: "YFXMBH-1",
    projectName: "项目A",
    bizDate: new Date("2026-07-01"),
    remark: null,
    customerNameSnapshot: null,
    supplierNameSnapshot: null,
    managerNameSnapshot: null,
  };

  it("returns empty when nothing changed", () => {
    expect(buildRdProjectHeaderChanges(base, { ...base })).toEqual([]);
  });

  it("captures changed fields with before/after values", () => {
    const changes = buildRdProjectHeaderChanges(base, {
      ...base,
      projectName: "项目B",
      bizDate: new Date("2026-07-05"),
      remark: "新备注",
    });
    expect(changes).toEqual([
      { label: "项目名称", before: "项目A", after: "项目B" },
      { label: "业务日期", before: "2026-07-01", after: "2026-07-05" },
      { label: "备注", before: null, after: "新备注" },
    ]);
  });
});

describe("buildRdProjectBomChanges", () => {
  const line = (
    overrides: Partial<
      Parameters<typeof buildRdProjectBomChanges>[0][number]
    > = {},
  ) => ({
    materialId: 100,
    materialCodeSnapshot: "MAT-100",
    materialNameSnapshot: "Material 100",
    quantity: new Prisma.Decimal(5),
    unitPrice: new Prisma.Decimal(10),
    manufacturer: null,
    productLink: null,
    remark: null,
    ...overrides,
  });

  it("returns empty when lines are identical", () => {
    expect(buildRdProjectBomChanges([line()], [line()])).toEqual([]);
  });

  it("captures quantity change with trimmed decimal text", () => {
    const changes = buildRdProjectBomChanges(
      [line()],
      [line({ quantity: new Prisma.Decimal("8.500000") })],
    );
    expect(changes).toEqual([
      {
        label: "BOM MAT-100 Material 100 计划数量",
        before: "5",
        after: "8.5",
      },
    ]);
  });

  it("captures added and removed lines", () => {
    const changes = buildRdProjectBomChanges(
      [line()],
      [
        line({
          materialId: 200,
          materialCodeSnapshot: "MAT-200",
          materialNameSnapshot: "Material 200",
        }),
      ],
    );
    expect(changes).toEqual([
      {
        label: "BOM 新增 MAT-200 Material 200",
        before: null,
        after: "数量 5，单价 10",
      },
      {
        label: "BOM 删除 MAT-100 Material 100",
        before: "数量 5，单价 10",
        after: null,
      },
    ]);
  });
});
