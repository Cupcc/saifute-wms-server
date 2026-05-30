import { IsInt, IsString, Matches, Min } from "class-validator";

export class CreateStockInPriceCorrectionOrderLineDto {
  @IsInt()
  @Min(1)
  materialId!: number;

  @IsInt()
  @Min(1)
  sourceInventoryLogId!: number;

  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,4})?$/, {
    message:
      "correctUnitCost must be a positive decimal string with up to 4 decimals",
  })
  correctUnitCost!: string;
}
