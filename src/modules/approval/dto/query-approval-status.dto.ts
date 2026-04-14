import { Type } from "class-transformer";
import { IsEnum, IsInt, Min } from "class-validator";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";

export class QueryApprovalStatusDto {
  @IsEnum(BusinessDocumentType)
  documentType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  documentId!: number;
}
