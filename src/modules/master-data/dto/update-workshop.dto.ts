import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateWorkshopDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  workshopName?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  defaultHandlerPersonnelId?: number | null;
}
