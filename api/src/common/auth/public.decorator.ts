import { SetMetadata } from '@nestjs/common';

// Marca una ruta como pública. Todo lo que NO lleve esta marca queda cerrado
// (ver deny-by-default.guard.ts): olvidar proteger una ruta nueva es imposible,
// porque lo que se olvida es abrirla.
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
