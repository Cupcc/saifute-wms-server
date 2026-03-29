import {
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

  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,6})?$/, {
    message: "quantity must be a positive decimal string",
  })
  quantity!: string;

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
