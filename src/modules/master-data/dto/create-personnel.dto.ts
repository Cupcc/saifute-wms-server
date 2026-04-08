import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreatePersonnelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  personnelName!: string;
}
