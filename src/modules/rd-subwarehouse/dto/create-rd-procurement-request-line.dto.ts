import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CreateRdProcurementRequestLineDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  materialId?: number;

  @ValidateIf((line) => line.materialId == null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  materialName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  specModel?: string;

  @ValidateIf((line) => line.materialId == null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  unitCode?: string;

  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,6})?$/, {
    message: "quantity must be a positive decimal string",
  })
  quantity!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{1,10}(\.\d{1,4})?$/, {
    message:
      "unitPrice must be a non-negative decimal string with up to 4 decimals",
  })
  unitPrice?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}
