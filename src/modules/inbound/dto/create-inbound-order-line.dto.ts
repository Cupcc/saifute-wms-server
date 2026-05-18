import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CreateInboundOrderLineDto {
  @ValidateIf((line) => !line.materialName)
  @IsInt()
  @Min(1)
  materialId?: number;

  @ValidateIf((line) => !line.materialId)
  @IsString()
  @MaxLength(128)
  materialName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  materialCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  specModel?: string;

  @ValidateIf((line) => !line.materialId)
  @IsString()
  @MaxLength(32)
  unitCode?: string;

  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,6})?$/, {
    message: "quantity must be a positive decimal string",
  })
  quantity!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      "unitPrice must be a non-negative decimal string with up to 2 decimals",
  })
  unitPrice?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}
