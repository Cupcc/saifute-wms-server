import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class CreateRdStocktakeOrderLineDto {
  @IsInt()
  @Min(1)
  materialId!: number;

  @IsString()
  @Matches(/^\d+(\.\d{1,6})?$/, {
    message: "countedQty must be a non-negative decimal string",
  })
  countedQty!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}
