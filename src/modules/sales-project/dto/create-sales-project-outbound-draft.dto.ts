import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

class SalesProjectOutboundDraftLineDto {
  @IsInt()
  @Min(1)
  materialId!: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  sourceProjectTargetId?: number | null;

  @IsString()
  @IsOptional()
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,6})?$/, {
    message: "quantity must be a positive decimal string",
  })
  quantity?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message:
      "unitPrice must be a non-negative decimal string with up to 4 decimals",
  })
  unitPrice?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message:
      "selectedUnitCost must be a non-negative decimal string with up to 4 decimals",
  })
  selectedUnitCost?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}

export class CreateSalesProjectOutboundDraftDto {
  @IsDateString()
  @IsOptional()
  bizDate?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  customerId?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  handlerPersonnelId?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  workshopId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SalesProjectOutboundDraftLineDto)
  lines?: SalesProjectOutboundDraftLineDto[];
}
