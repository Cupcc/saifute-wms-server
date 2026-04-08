import { IsOptional, IsString, MaxLength } from "class-validator";

export class RejectApprovalDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  rejectReason?: string;
}
