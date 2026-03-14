import { IsString, IsUUID, Length, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  @Length(1, 32)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsUUID()
  captchaId!: string;

  @IsString()
  @Length(4, 4)
  captchaCode!: string;
}
