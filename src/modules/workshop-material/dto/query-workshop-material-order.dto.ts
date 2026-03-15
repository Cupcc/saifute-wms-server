import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { WorkshopMaterialOrderType } from "../../../generated/prisma/client";

export class QueryWorkshopMaterialOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  documentNo?: string;

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
