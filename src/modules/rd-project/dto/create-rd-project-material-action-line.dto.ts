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

export class CreateRdProjectMaterialActionLineDto {
  @IsInt()
  @Min(1)
  materialId!: number;

  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,6})?$/, {
    message: "数量必须为正数，整数位最多 12 位、小数位最多 6 位",
  })
  quantity!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{1,10}(\.\d{1,6})?$/, {
    message: "单价必须为不小于 0 的数字，整数位最多 10 位、小数位最多 6 位",
  })
  unitPrice?: string;

  @IsOptional()
  @IsEnum(BusinessDocumentType)
  sourceDocumentType?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  sourceDocumentId?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  sourceDocumentLineId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}
