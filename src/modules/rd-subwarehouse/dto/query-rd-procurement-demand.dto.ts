import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class QueryRdProcurementDemandDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  keyword?: string;

  @IsDateString({ strict: true })
  @IsOptional()
  needDateFrom?: string;

  @IsDateString({ strict: true })
  @IsOptional()
  needDateTo?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  rdProjectId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  projectCode?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  applicantUserId?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  limit = 50;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(0)
  offset = 0;
}
