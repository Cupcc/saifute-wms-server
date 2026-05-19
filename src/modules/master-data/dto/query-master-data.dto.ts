import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { normalizeMaterialCode } from "../../../shared/domain/material-code";

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === "" || value === null || typeof value === "undefined") {
    return undefined;
  }

  return Number(value);
}

export class QueryMasterDataDto {
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @IsOptional()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  includeDisabled?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;
}

export class QueryMaterialDto extends QueryMasterDataDto {
  @Transform(({ value }) => {
    const normalized = trimOptionalString(value);
    return normalized ? normalizeMaterialCode(normalized) : undefined;
  })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  materialCode?: string;

  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @IsOptional()
  @MaxLength(128)
  materialName?: string;

  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @IsOptional()
  @MaxLength(128)
  specModel?: string;

  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @IsOptional()
  @MaxLength(128)
  specification?: string;

  @IsOptional()
  @Transform(({ value }) => parseOptionalNumber(value))
  @IsInt()
  @Min(1)
  categoryId?: number;

  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @IsOptional()
  @MaxLength(32)
  unitCode?: string;

  @Transform(({ value }) => trimOptionalString(value))
  @Matches(/^\d+(\.\d{1,6})?$/)
  @IsOptional()
  warningMinQty?: string;
}
