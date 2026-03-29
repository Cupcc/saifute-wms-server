import { IsOptional, IsString, MaxLength } from "class-validator";

export class VoidRdStocktakeOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  voidReason?: string;
}
