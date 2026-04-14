import { Body, Controller, Get, Headers, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Public } from "../../../shared/decorators/public.decorator";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { AuthService } from "../application/auth.service";
import { LoginDto } from "../dto/login.dto";
import { RefreshTokenDto } from "../dto/refresh-token.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get("captcha")
  async generateCaptcha() {
    return this.authService.generateCaptcha();
  }

  @Public()
  @Post("login")
  async login(@Body() loginDto: LoginDto, @Req() request: Request) {
    return this.authService.login(loginDto, request);
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @Public()
  @Post("logout")
  async logout(
    @Headers("authorization") authorization: string | undefined,
    @Req() request: Request,
  ) {
    return this.authService.logout(authorization, request);
  }

  @Get("me")
  async getCurrentUser(@CurrentUser() user: SessionUserSnapshot) {
    return this.authService.getCurrentUser(user);
  }

  @Get("routes")
  async getRoutes(@CurrentUser() user: SessionUserSnapshot) {
    return this.authService.getRoutes(user);
  }
}
