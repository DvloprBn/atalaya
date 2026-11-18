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

export function invitation(url: string, roleName: string): EmailContent {
  return {
    subject: 'Te crearon una cuenta en Atalaya',
    title: 'Te crearon una cuenta',
    paragraphs: [
      `Una persona del equipo de Atalaya te creó una cuenta con el rol «${roleName}».`,
      'Para activarla, elige tu contraseña con el enlace de abajo. Vence en 72 horas.',
      'Si no esperabas esta invitación, ignora este correo: la cuenta no se activa sin ti.',
      STUDY,
    ],
    action: { label: 'Elegir mi contraseña', url },
  };
}

/** Se vinculó Google a una cuenta que ya existía: se avisa SIEMPRE al dueño del correo. */
export function googleLinked(forgotUrl: string): EmailContent {
  return {
    subject: 'Se vinculó Google a tu cuenta de Atalaya',
    title: 'Se vinculó Google a tu cuenta',
    paragraphs: [
      'Alguien entró a Atalaya con Google usando este correo, y tu cuenta quedó vinculada a ese acceso.',
      'Si fuiste tú, no hace falta que hagas nada.',
      'Si NO fuiste tú, restablece tu contraseña ahora: eso cierra todas tus sesiones.',
      STUDY,
    ],
    action: { label: 'Restablecer mi contraseña', url: forgotUrl },
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

/** Se detectó el robo de un refresh token y se cerraron TODAS las sesiones de la cuenta (S-7). */
export function sessionsClosed(forgotUrl: string): EmailContent {
  return {
    subject: 'Cerramos tus sesiones de Atalaya por seguridad',
    title: 'Cerramos tus sesiones',
    paragraphs: [
      'Detectamos que alguien intentó usar una sesión tuya que ya estaba cerrada. Es la señal de que una copia de tu sesión pudo caer en otras manos.',
      'Por seguridad cerramos todas tus sesiones abiertas. Para volver a entrar necesitas tu contraseña.',
      'Si usas la misma contraseña en otros sitios, o si usas un equipo compartido, cámbiala ahora: eso vuelve a cerrar todo.',
      STUDY,
    ],
    action: { label: 'Cambiar mi contraseña', url: forgotUrl },
  };
}
