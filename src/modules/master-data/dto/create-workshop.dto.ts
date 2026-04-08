import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateWorkshopDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  workshopName!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  defaultHandlerPersonnelId?: number | null;
}
