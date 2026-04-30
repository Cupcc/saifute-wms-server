import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";

export class CreateWorkshopMaterialOrderLineDto {
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
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,2})?$/, {
    message:
      "selectedUnitCost must be a positive decimal string with up to 2 decimals",
  })
  selectedUnitCost?: string;

  /** Optional source log ID for source-tracked pick consumption. */
  @IsInt()
  @IsOptional()
  @Min(1)
  sourceLogId?: number;

  /** For return orders: upstream pick document type (e.g. WorkshopMaterialOrder). */
  @IsOptional()
  @IsEnum(BusinessDocumentType)
  sourceDocumentType?: string;

  /** For return orders: upstream pick document ID. */
  @IsInt()
  @IsOptional()
  @Min(1)
  sourceDocumentId?: number;

  /** For return orders: upstream pick line ID. */
  @IsInt()
  @IsOptional()
  @Min(1)
  sourceDocumentLineId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}
