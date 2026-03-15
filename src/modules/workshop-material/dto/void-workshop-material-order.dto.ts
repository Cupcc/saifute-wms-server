import { IsOptional, IsString, MaxLength } from "class-validator";

export class VoidWorkshopMaterialOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  voidReason?: string;
}
