import type { EmailContent } from '../mail/email-template.js';

// Los textos de los correos de acceso, en un solo lugar. Solo texto: la
// plantilla (mail/email-template.ts) se encarga del HTML y del escapado.

const IGNORE = 'Si no fuiste tú, ignora este correo: no pasa nada.';
const STUDY = 'Atalaya es un proyecto de estudio: usa solo datos de prueba.';

export function verifyEmail(url: string): EmailContent {
  return {
    subject: 'Confirma tu correo en Atalaya',
    title: 'Confirma tu correo',
    paragraphs: ['Alguien pidió crear una cuenta en Atalaya con este correo.', 'El enlace vence en 24 horas.', IGNORE, STUDY],
    action: { label: 'Confirmar mi correo', url },
  };
}

/** Registro con un correo que YA tiene cuenta: se avisa por correo, nunca en la pantalla. */
export function alreadyRegistered(loginUrl: string, forgotUrl: string): EmailContent {
  return {
    subject: 'Ya tienes una cuenta en Atalaya',
    title: 'Ya tienes una cuenta',
    paragraphs: [
      'Alguien intentó registrarse en Atalaya con este correo, pero ya tiene una cuenta.',
      `Para entrar: ${loginUrl}`,
      IGNORE,
    ],
    action: { label: '¿Olvidaste tu contraseña?', url: forgotUrl },
  };
}

export function resetPassword(url: string): EmailContent {
  return {
    subject: 'Restablece tu contraseña de Atalaya',
    title: 'Restablece tu contraseña',
    paragraphs: [
      'Alguien pidió restablecer la contraseña de tu cuenta.',
      'El enlace vence en 1 hora. Al usarlo se cierran todas tus sesiones abiertas.',
      IGNORE,
    ],
    action: { label: 'Elegir una contraseña nueva', url },
  };
}

/** Restablecer con un correo SIN cuenta: también recibe un correo (misma respuesta, mismo trabajo). */
export function noAccountForReset(registerUrl: string): EmailContent {
  return {
    subject: 'Solicitud de contraseña en Atalaya',
    title: 'No hay una cuenta con este correo',
    paragraphs: ['Alguien pidió restablecer una contraseña en Atalaya con este correo, pero no tiene cuenta.', IGNORE],
    action: { label: 'Crear una cuenta', url: registerUrl },
  };
}
