import { IsOptional, IsString, MaxLength } from "class-validator";

export class VoidProjectDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  voidReason?: string;
}
