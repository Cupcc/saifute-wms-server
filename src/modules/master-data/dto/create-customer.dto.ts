import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  customerCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contactPerson?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsInt()
  @IsOptional()
  @Min(1)
  parentId?: number;
}
