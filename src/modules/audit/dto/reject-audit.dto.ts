import { IsOptional, IsString, MaxLength } from "class-validator";

export class RejectAuditDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  rejectReason?: string;
}
