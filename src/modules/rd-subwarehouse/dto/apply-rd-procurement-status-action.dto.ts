import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export const RD_PROCUREMENT_STATUS_ACTIONS = [
  "PROCUREMENT_STARTED",
  "ACCEPTANCE_CONFIRMED",
  "MANUAL_CANCELLED",
  "MANUAL_RETURNED",
] as const;

export type RdProcurementStatusActionType =
  (typeof RD_PROCUREMENT_STATUS_ACTIONS)[number];

export class ApplyRdProcurementStatusActionDto {
  @IsString()
  @IsIn(RD_PROCUREMENT_STATUS_ACTIONS)
  actionType!: RdProcurementStatusActionType;

  @IsInt()
  @Min(1)
  lineId!: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  materialId?: number;

  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,6})?$/, {
    message: "quantity must be a positive decimal string",
  })
  quantity!: string;

  @IsDateString({ strict: true })
  @IsOptional()
  bizDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  referenceNo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
