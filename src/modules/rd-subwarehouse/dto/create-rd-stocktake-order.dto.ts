import { Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { CreateRdStocktakeOrderLineDto } from "./create-rd-stocktake-order-line.dto";

export class CreateRdStocktakeOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentNo?: string;

  @IsDateString({ strict: true })
  bizDate!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  workshopId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  countedBy?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  approvedBy?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "lines must have at least one item" })
  @ArrayUnique(
    (line: CreateRdStocktakeOrderLineDto) =>
      `${line.rdProjectId}:${line.materialId}`,
    {
      message: "lines must not contain duplicate rdProjectId:materialId",
    },
  )
  @ValidateNested({ each: true })
  @Type(() => CreateRdStocktakeOrderLineDto)
  lines!: CreateRdStocktakeOrderLineDto[];
}
