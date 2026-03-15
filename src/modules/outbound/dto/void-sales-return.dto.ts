import { IsOptional, IsString, MaxLength } from "class-validator";

export class VoidSalesReturnDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  voidReason?: string;
}
