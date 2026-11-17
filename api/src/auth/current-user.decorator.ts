import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** El usuario que AuthGuard dejó en la petición, ya revisado contra la base. */
export interface AuthUser {
  id: string;
  email: string;
  role: { name: string; level: number };
  sessionId: string;
}

/** Uso: `me(@CurrentUser() user: AuthUser)`. Solo en rutas protegidas. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => context.switchToHttp().getRequest().user,
);
