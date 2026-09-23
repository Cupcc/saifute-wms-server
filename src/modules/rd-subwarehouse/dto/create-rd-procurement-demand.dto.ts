import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateRdProcurementDemandLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rdProjectId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  materialName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  specification!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  unit!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  quantity!: number;

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

export class CreateRdProcurementDemandDto {
  @IsDateString({ strict: true })
  needDate!: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  clientRequestId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "至少需要填写一行研发采购需求" })
  @ValidateNested({ each: true })
  @Type(() => CreateRdProcurementDemandLineDto)
  lines!: CreateRdProcurementDemandLineDto[];
}
