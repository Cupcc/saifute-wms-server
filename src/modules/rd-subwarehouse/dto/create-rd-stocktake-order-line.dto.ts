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

  @IsInt()
  @Min(1)
  rdProjectId!: number;

  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,6})?$/, {
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
