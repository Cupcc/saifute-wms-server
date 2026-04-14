import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";

export class QueryInventoryBalancesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class QueryInventoryLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;

  @IsOptional()
  @IsIn(["MAIN", "RD_SUB"])
  stockScope?: "MAIN" | "RD_SUB";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  businessDocumentId?: number;

  @IsOptional()
  @IsEnum(BusinessDocumentType)
  businessDocumentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessDocumentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  operationType?: string;

  @IsOptional()
  @IsDateString()
  bizDateFrom?: string;

  @IsOptional()
  @IsDateString()
  bizDateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class QueryInventoryPriceLayersDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId!: number;

  @IsOptional()
  @IsIn(["MAIN", "RD_SUB"])
  stockScope?: "MAIN" | "RD_SUB";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;
}

export class QueryInventorySourceUsagesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;

  @IsOptional()
  @IsEnum(BusinessDocumentType)
  consumerDocumentType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  consumerDocumentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class QueryFactoryNumberReservationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workshopId?: number;

  @IsOptional()
  @IsEnum(BusinessDocumentType)
  businessDocumentType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  businessDocumentLineId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  startNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  endNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
