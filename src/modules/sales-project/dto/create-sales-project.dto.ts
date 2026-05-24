import { Type } from "class-transformer";
import {
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
import { SalesProjectMaterialLineDto } from "./sales-project-material-line.dto";

export class CreateSalesProjectDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  salesProjectCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  salesProjectName!: string;

  @IsDateString()
  bizDate!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  customerId?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  managerPersonnelId?: number;

  @IsInt()
  @Min(1)
  workshopId!: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SalesProjectMaterialLineDto)
  materialLines?: SalesProjectMaterialLineDto[];
}
