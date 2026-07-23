import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { DatabaseModule } from '@database/database.module';
import { EmailModule } from '@modules/email';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import {
  PasswordService,
  TokenService,
  SessionService,
  VerificationTokenService,
  AuthAuditService,
  LoginProtectionService,
} from './services';

@Module({
  imports: [
    DatabaseModule,
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.get<string>('jwt.expiration') || '15m';
        return {
          secret: configService.get<string>('jwt.secret'),
          signOptions: {
            expiresIn: expiresIn as unknown as number | undefined,
            issuer: configService.get<string>('jwt.issuer'),
            audience: configService.get<string>('jwt.audience'),
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PasswordService,
    TokenService,
    SessionService,
    VerificationTokenService,
    AuthAuditService,
    LoginProtectionService,
  ],
  exports: [
    AuthService,
    JwtStrategy,
    PassportModule,
    JwtModule,
    PasswordService,
    TokenService,
    SessionService,
    VerificationTokenService,
    AuthAuditService,
    LoginProtectionService,
  ],
})
export class AuthModule {}
