import { Type } from "class-transformer";
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from "class-validator";

export class UpdateRdProcurementDemandDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  rdProjectId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  materialName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  specification?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  @Min(0.000001)
  quantity?: number;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  supplierText?: string;

  @IsUrl({ require_protocol: true })
  @IsOptional()
  @MaxLength(1000)
  purchaseUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  noteText?: string;

  @IsOptional()
  imageMetadata?: unknown;
}
