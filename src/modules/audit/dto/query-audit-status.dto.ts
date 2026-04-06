import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";

export class QueryAuditStatusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  documentType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  documentId!: number;
}
