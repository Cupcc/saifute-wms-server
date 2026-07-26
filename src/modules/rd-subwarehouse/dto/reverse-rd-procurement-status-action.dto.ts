import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReverseRdProcurementStatusActionDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
