import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreatePersonnelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  personnelName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string | null;
}
