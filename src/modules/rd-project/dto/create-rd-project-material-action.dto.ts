import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { RdProjectMaterialActionType } from "../../../../generated/prisma/client";
import { CreateRdProjectMaterialActionLineDto } from "./create-rd-project-material-action-line.dto";

export class CreateRdProjectMaterialActionDto {
  @IsEnum(RdProjectMaterialActionType)
  actionType!: RdProjectMaterialActionType;

  @IsDateString({ strict: true })
  bizDate!: string;

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
  @Type(() => CreateRdProjectMaterialActionLineDto)
  lines!: CreateRdProjectMaterialActionLineDto[];
}
