import { ValidationPipe } from "@nestjs/common";
import { QueryMaterialDto } from "./query-master-data.dto";

describe("QueryMaterialDto", () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it("accepts structured material list filters", async () => {
    const result = (await pipe.transform(
      {
        materialCode: " yf 05 ",
        materialName: " 轴承 ",
        specModel: "6205",
        categoryId: "3",
        unitCode: "PCS",
        warningMinQty: "5.500000",
        limit: "20",
        offset: "10",
      },
      {
        type: "query",
        metatype: QueryMaterialDto,
      },
    )) as QueryMaterialDto;

    expect(result).toEqual(
      expect.objectContaining({
        materialCode: "yf05",
        materialName: "轴承",
        specModel: "6205",
        categoryId: 3,
        unitCode: "PCS",
        warningMinQty: "5.500000",
        limit: 20,
        offset: 10,
      }),
    );
  });
});
