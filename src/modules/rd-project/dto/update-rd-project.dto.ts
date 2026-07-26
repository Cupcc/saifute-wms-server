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
import { RdProjectBomLineDto } from "./rd-project-bom-line.dto";

export class UpdateRdProjectDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(64)
  projectCode?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(128)
  projectName?: string;

  @IsDateString({ strict: true })
  @IsOptional()
  bizDate?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  customerId?: number | null;

  @IsInt()
  @IsOptional()
  @Min(1)
  supplierId?: number | null;

  @IsInt()
  @IsOptional()
  @Min(1)
  managerPersonnelId?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string | null;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RdProjectBomLineDto)
  bomLines?: RdProjectBomLineDto[];
}
