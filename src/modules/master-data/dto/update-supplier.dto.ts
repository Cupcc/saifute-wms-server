import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  supplierCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  supplierName?: string;

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
}
