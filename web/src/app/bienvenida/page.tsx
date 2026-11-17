'use client';
import { NewPasswordScreen } from '@/components/new-password-screen';

// Enlace de invitación: la persona elige SU contraseña (nadie más la conoce).
export default function WelcomePage() {
  return (
    <NewPasswordScreen
      endpoint="/api/auth/accept-invite"
      title="Elige tu contraseña"
      button="Activar mi cuenta"
      noToken="Este enlace no trae un código. Pide a quien te invitó que te mande otro."
    />
  );
}
