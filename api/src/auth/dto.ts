import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './passwords.js';
import { OPAQUE_TOKEN_PATTERN } from './tokens.js';

// Los DTO definen EXACTAMENTE qué entra. Con `whitelist + forbidNonWhitelisted`
// (main.ts), un campo extra como {"role":"super"} se rechaza con 400 (OWASP API3).

/** El correo se normaliza antes de validarlo: 'Ana@X.com ' y 'ana@x.com' son la misma cuenta. */
const normalizeEmail = Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export class EmailDto {
  @normalizeEmail
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class RegisterDto extends EmailDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

/** En el login no se exige el mínimo: decir "muy corta" revelaría la política sin ganar nada. */
export class LoginDto extends EmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class TokenDto {
  @IsString()
  @Matches(OPAQUE_TOKEN_PATTERN)
  token: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
