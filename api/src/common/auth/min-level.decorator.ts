import { SetMetadata } from '@nestjs/common';

// Nivel mínimo para usar una ruta: 0 = usuario … 5 = super.
// Se pone en el controlador o en el método: `@MinLevel(3)` = admin, director o super.
// Sin esta marca, una ruta con sesión la puede usar cualquier nivel.
export const MIN_LEVEL = 'minLevel';
export const MinLevel = (level: number) => SetMetadata(MIN_LEVEL, level);

/** Los niveles con nombre, para que el código diga `LEVEL.admin` y no un 3 suelto. */
export const LEVEL = { usuario: 0, staff: 1, manager: 2, admin: 3, director: 4, super: 5 } as const;
