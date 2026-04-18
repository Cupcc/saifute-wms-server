import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateMaterialCategoryDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  categoryName?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sortOrder?: number;
}
