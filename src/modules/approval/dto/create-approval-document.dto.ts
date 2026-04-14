import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { DocumentFamily } from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";

export class CreateApprovalDocumentDto {
  @IsEnum(DocumentFamily)
  documentFamily!: DocumentFamily;

  @IsEnum(BusinessDocumentType)
  documentType!: string;

  @IsInt()
  @Min(1)
  documentId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  documentNumber!: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  submittedBy?: string;
}
