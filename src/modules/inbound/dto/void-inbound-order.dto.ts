import { IsOptional, IsString, MaxLength } from "class-validator";

export class VoidInboundOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  voidReason?: string;
}
