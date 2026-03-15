import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class CreateInboundOrderLineDto {
  @IsInt()
  @Min(1)
  materialId!: number;

  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,6})?$/, {
    message: "quantity must be a positive decimal string",
  })
  quantity!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      "unitPrice must be a non-negative decimal string with up to 2 decimals",
  })
  unitPrice?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}
