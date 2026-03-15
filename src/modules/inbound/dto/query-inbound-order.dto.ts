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
import { StockInOrderType } from "../../../generated/prisma/client";

export class QueryInboundOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  documentNo?: string;

  @IsEnum(StockInOrderType)
  @IsOptional()
  orderType?: StockInOrderType;

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
  supplierId?: number;

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
