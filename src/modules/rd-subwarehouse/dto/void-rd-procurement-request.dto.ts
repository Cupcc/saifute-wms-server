import { IsOptional, IsString, MaxLength } from "class-validator";

export class VoidRdProcurementRequestDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  voidReason?: string;
}
