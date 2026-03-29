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
import { CreateRdProcurementRequestLineDto } from "./create-rd-procurement-request-line.dto";

export class CreateRdProcurementRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  documentNo!: string;

  @IsDateString()
  bizDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  projectCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  projectName!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  supplierId?: number;

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
  @Type(() => CreateRdProcurementRequestLineDto)
  lines!: CreateRdProcurementRequestLineDto[];
}
