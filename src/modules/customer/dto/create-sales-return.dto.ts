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
import { CreateSalesReturnLineDto } from "./create-sales-return-line.dto";

export class CreateSalesReturnDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentNo?: string;

  @IsDateString()
  bizDate!: string;

  @IsInt()
  @Min(1)
  sourceOutboundOrderId!: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  customerId?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  handlerPersonnelId?: number;

  @IsInt()
  @Min(1)
  workshopId!: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "lines must have at least one item" })
  @ValidateNested({ each: true })
  @Type(() => CreateSalesReturnLineDto)
  lines!: CreateSalesReturnLineDto[];
}
