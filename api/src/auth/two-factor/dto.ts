import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { OPAQUE_TOKEN_PATTERN } from '../tokens.js';

// Qué entra a las rutas del 2FA. `forbidNonWhitelisted` (main.ts) rechaza cualquier campo extra.

/** 6 dígitos de la app, o un código de recuperación (con o sin guiones). El servicio decide cuál es. */
class Code {
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code: string;
}

class Password {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class PasswordDto extends Password {}
export class CodeDto extends Code {}
export class PasswordAndCodeDto extends Code {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class VerifyDto extends Code {
  @IsString()
  @Matches(OPAQUE_TOKEN_PATTERN)
  challenge: string;
}
