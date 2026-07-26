import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { WorkshopMaterialOrderType } from "../../../../generated/prisma/client";

export class QueryWorkshopMaterialOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  documentNo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  handlerName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  detailId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  materialCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  materialName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  specification?: string;

  @IsEnum(WorkshopMaterialOrderType)
  @IsOptional()
  orderType?: WorkshopMaterialOrderType;

  @IsDateString()
  @IsOptional()
  bizDateFrom?: string;

  @IsDateString()
  @IsOptional()
  bizDateTo?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  workshopId?: number;

  @IsOptional()
  @IsIn(["MAIN", "RD_SUB"])
  stockScope?: "MAIN" | "RD_SUB";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(16)
  sourceType?: string;

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
}
