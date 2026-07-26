import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { CreateRdHandoffOrderLineDto } from "./create-rd-handoff-order-line.dto";

export class CreateRdHandoffOrderDto {
  @IsDateString({ strict: true })
  bizDate!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  handlerPersonnelId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  clientRequestId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "lines must have at least one item" })
  @ValidateNested({ each: true })
  @Type(() => CreateRdHandoffOrderLineDto)
  lines!: CreateRdHandoffOrderLineDto[];
}
