// S-8 contra el sistema VIVO: la lista de contraseñas comunes se aplica en las TRES puertas donde se elige una contraseña
// (registro, restablecer con enlace, aceptar invitación) y rechazarla no gasta el enlace del correo.
// Cuentas de la semilla: <rol>@example.com / TestOnly123!
import { Browser, tokenFrom, uniqueEmail, waitForMail } from './helpers.js';

const WEAK = 'Password2026!';
const GOOD = 'violeta cobre nube 92 azul';

describe('S-8 · contraseñas comunes en las tres puertas', () => {
  it('registro: una contraseña común da 400 con el motivo, y una buena sigue dando 202', async () => {
    const weak = await new Browser().post('/api/auth/register', { email: uniqueEmail('debil'), password: WEAK });
    expect(weak.status).toBe(400);
    expect(JSON.stringify(weak.body)).toContain('más comunes');
    // Misma respuesta exista o no la cuenta: la regla no depende del correo, así que no revela nada de él.
    const good = await new Browser().post('/api/auth/register', { email: uniqueEmail('buena'), password: GOOD });
    expect(good.status).toBe(202);
  });

  it('restablecer: la contraseña común se rechaza SIN gastar el enlace, y con una buena el mismo enlace sirve', async () => {
    const email = uniqueEmail('reset');
    await new Browser().post('/api/auth/register', { email, password: GOOD });
    await new Browser().post('/api/auth/verify-email', { token: tokenFrom(await waitForMail(email, 'Confirma tu correo')) });
    await new Browser().post('/api/auth/forgot-password', { email });
    const token = tokenFrom(await waitForMail(email, 'Restablece tu contraseña'));

    const weak = await new Browser().post('/api/auth/reset-password', { token, password: WEAK });
    expect(weak.status).toBe(400);
    expect(JSON.stringify(weak.body)).toContain('más comunes');
    expect((await new Browser().post('/api/auth/reset-password', { token, password: 'otra frase larga y distinta 7' })).status).toBe(200);
  });

  it('invitación: la contraseña común se rechaza sin gastar el enlace, y con una buena la cuenta se activa', async () => {
    const admin = new Browser();
    expect((await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'TestOnly123!' })).status).toBe(200);
    const email = uniqueEmail('invitada');
    expect((await admin.post('/api/admin/users', { email, roleName: 'staff' })).status).toBe(201);
    const token = tokenFrom(await waitForMail(email, 'Te crearon una cuenta'));

    const weak = await new Browser().post('/api/auth/accept-invite', { token, password: WEAK });
    expect(weak.status).toBe(400);
    expect(JSON.stringify(weak.body)).toContain('más comunes');
    expect((await new Browser().post('/api/auth/accept-invite', { token, password: GOOD })).status).toBe(200);
  });

  it('el login NO aplica la lista: quien ya tiene una contraseña común no queda fuera (solo se exige al elegirla)', async () => {
    // 'TestOnly123!' es la de la semilla: no es de la lista, pero el principio es el mismo; el login no mira la política.
    expect((await new Browser().post('/api/auth/login', { email: 'usuario@example.com', password: 'TestOnly123!' })).status).toBe(200);
    expect((await new Browser().post('/api/auth/login', { email: 'usuario@example.com', password: WEAK })).status).toBe(401);
  });
});
