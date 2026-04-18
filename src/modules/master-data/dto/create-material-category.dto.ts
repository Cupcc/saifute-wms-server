import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateMaterialCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  categoryCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  categoryName!: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sortOrder?: number;
}
