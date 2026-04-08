import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { StockInOrderType } from "../../../generated/prisma/client";
import { CreateInboundOrderLineDto } from "./create-inbound-order-line.dto";

export class CreateInboundOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentNo?: string;

  @IsEnum(StockInOrderType)
  orderType!: StockInOrderType;

  @IsDateString()
  bizDate!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  supplierId?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  handlerPersonnelId?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  workshopId?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  rdProcurementRequestId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "lines must have at least one item" })
  @ValidateNested({ each: true })
  @Type(() => CreateInboundOrderLineDto)
  lines!: CreateInboundOrderLineDto[];
}
