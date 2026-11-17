'use client';
import { NewPasswordScreen } from '@/components/new-password-screen';

export default function ResetPasswordPage() {
  return (
    <NewPasswordScreen
      endpoint="/api/auth/reset-password"
      title="Elige una contraseña nueva"
      button="Guardar"
      noToken="Este enlace no trae un código. Pide uno nuevo en «¿Olvidaste tu contraseña?»."
    />
  );
}
