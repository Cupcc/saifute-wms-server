import { IsString, MinLength } from "class-validator";

export class RefreshTokenDto {
  /** 刷新访问令牌用的 refresh token */
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
