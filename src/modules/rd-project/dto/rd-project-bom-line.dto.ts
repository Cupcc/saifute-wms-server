import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class RdProjectBomLineDto {
  @IsInt()
  @Min(1)
  materialId!: number;

  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,6})?$/, {
    message: "物料数量必须大于0，且最多12位整数、6位小数",
  })
  quantity!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{1,10}(\.\d{1,4})?$/, {
    message: "物料单价不能为负数，且最多10位整数、4位小数",
  })
  unitPrice?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  manufacturer?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  productLink?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}
