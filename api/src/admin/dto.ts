import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EmailDto } from '../auth/dto.js';
import { PasswordAndCodeDto } from '../auth/two-factor/dto.js';

/** Los roles se piden por NOMBRE: un id numérico en la API es un detalle de la base. */
export const ROLE_NAMES = ['usuario', 'staff', 'manager', 'admin', 'director', 'super'] as const;

export class CreateUserDto extends EmailDto {
  @IsIn(ROLE_NAMES)
  roleName: string;
}

export class ChangeRoleDto {
  @IsIn(ROLE_NAMES)
  roleName: string;
}

export class ListUsersQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number) // la consulta llega como texto: "2" → 2
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

/**
 * S-10: el admin pide quitar el 2FA de alguien. `password` y `code` son los SUYOS (demuestra que es él);
 * `reason` cuenta cómo verificó la identidad de la persona: se guarda y se le muestra a ella en el correo.
 */
export class TwoFactorResetDto extends PasswordAndCodeDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  reason: string;
}
