import { Transform } from "class-transformer";
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { normalizeMaterialCode } from "../../../shared/domain/material-code";

export class CreateMaterialDto {
  @Transform(({ value }) =>
    typeof value === "string" ? normalizeMaterialCode(value) : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  materialCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  materialName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  specModel?: string;

  @IsNumber()
  @IsOptional()
  categoryId?: number | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  unitCode!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,6})?$/)
  warningMinQty?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,6})?$/)
  warningMaxQty?: string;
}
