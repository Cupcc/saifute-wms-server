import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

class QueryRdProcurementMaterialOptionsBaseDto {
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @IsOptional()
  @MaxLength(128)
  keyword?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(0)
  offset: number = 0;
}

export class QueryRdProcurementMaterialSuggestionsDto extends QueryRdProcurementMaterialOptionsBaseDto {
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  projectCode!: string;
}

export class QueryRdAcceptanceMaterialOptionsDto extends QueryRdProcurementMaterialOptionsBaseDto {}
