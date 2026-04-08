import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { WorkshopMaterialOrderType } from "../../../generated/prisma/client";
import { UpdateWorkshopMaterialOrderLineDto } from "./update-workshop-material-order-line.dto";

export class UpdateWorkshopMaterialOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  documentNo?: string;

  @IsEnum(WorkshopMaterialOrderType)
  @IsOptional()
  orderType?: WorkshopMaterialOrderType;

  @IsDateString()
  @IsOptional()
  bizDate?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  handlerPersonnelId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  handlerName?: string;

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
  @Type(() => UpdateWorkshopMaterialOrderLineDto)
  lines!: UpdateWorkshopMaterialOrderLineDto[];
}
