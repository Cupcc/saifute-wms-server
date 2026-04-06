import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";
import {
  AuditStatusSnapshot,
  DocumentFamily,
} from "../../../generated/prisma/client";

export class QueryAuditsDto {
  @IsOptional()
  @IsEnum(DocumentFamily)
  documentFamily?: DocumentFamily;

  @IsOptional()
  @IsEnum(AuditStatusSnapshot)
  auditStatus?: AuditStatusSnapshot;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
