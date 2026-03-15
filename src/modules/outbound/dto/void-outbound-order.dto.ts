import { IsOptional, IsString, MaxLength } from "class-validator";

export class VoidOutboundOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  voidReason?: string;
}
