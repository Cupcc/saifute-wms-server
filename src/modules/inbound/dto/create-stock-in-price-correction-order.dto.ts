import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { CreateStockInPriceCorrectionOrderLineDto } from "./create-stock-in-price-correction-order-line.dto";

export class CreateStockInPriceCorrectionOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentNo?: string;

  @IsDateString()
  bizDate!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  workshopId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "lines must have at least one item" })
  @ValidateNested({ each: true })
  @Type(() => CreateStockInPriceCorrectionOrderLineDto)
  lines!: CreateStockInPriceCorrectionOrderLineDto[];
}
