import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_TTL_MS, CSRF_HEADER } from './auth.constants';
import { unauthorizedException } from './auth-errors';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, LoginResponse, MeResponse } from './auth.types';
import { CurrentUser } from './current-user.decorator';
// DTO classes are runtime metatypes for the global ValidationPipe
// (design:paramtypes), so they must be value imports here; consistent-type-imports
// cannot detect that usage. The auth-dto.spec keeps them as values too.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ChangePasswordDto } from './dto/change-password.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LoginDto } from './dto/login.dto';
import type { SafePrincipal } from './session/session.types';

function csrfHeaderValue(request: AuthenticatedRequest): string | undefined {
  const value = request.headers[CSRF_HEADER];
  return typeof value === 'string' ? value : undefined;
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: AUTH_RATE_LIMIT_MAX, ttl: AUTH_RATE_LIMIT_TTL_MS } })
  @Header('Cache-Control', 'no-store')
  login(
    @Body() dto: LoginDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.authService.login(dto, res, request.headers.origin, request.headers.referer);
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @CurrentUser() user: SafePrincipal,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.authService.logout(
      user,
      res,
      request.headers.origin,
      request.headers.referer,
      csrfHeaderValue(request),
    );
  }

  @UseGuards(AuthGuard)
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(
    @CurrentUser() user: SafePrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<MeResponse> {
    const expectedCsrfTokenHash = request.expectedCsrfTokenHash;
    if (expectedCsrfTokenHash === undefined) {
      throw unauthorizedException();
    }
    return this.authService.me(user, expectedCsrfTokenHash);
  }

  @UseGuards(AuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: AUTH_RATE_LIMIT_MAX, ttl: AUTH_RATE_LIMIT_TTL_MS } })
  @Header('Cache-Control', 'no-store')
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: SafePrincipal,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.authService.changePassword(
      user,
      dto,
      res,
      request.headers.origin,
      request.headers.referer,
      csrfHeaderValue(request),
    );
  }
}
