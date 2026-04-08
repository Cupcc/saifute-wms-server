import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { DocumentFamily } from "../../../generated/prisma/client";

export class CreateApprovalDocumentDto {
  @IsEnum(DocumentFamily)
  documentFamily!: DocumentFamily;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
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
