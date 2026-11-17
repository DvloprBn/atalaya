import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Cifra el secreto TOTP antes de guardarlo. Quien robe un respaldo de la base NO obtiene
// los secretos: le falta la llave, que vive en el entorno (TOTP_ENCRYPTION_KEY), no en la base.
//
// AES-256-GCM: cifra Y firma. Si alguien cambia un solo byte del texto guardado, descifrar falla.
// AAD (datos asociados) = el id del usuario: un secreto copiado de una fila a otra no descifra,
// así que nadie puede "pasarle" a su cuenta el secreto de otra.
//
// Formato guardado:  v1.<iv>.<etiqueta>.<texto cifrado>   (todo en base64url)

const VERSION = 'v1';

export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('La llave de cifrado debe ser de 32 bytes (64 hexadecimales)');
  }

  encrypt(plain: string, userId: string): string {
    const iv = randomBytes(12); // uno NUEVO por cifrado: reusarlo con la misma llave rompe GCM
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(userId));
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }

  decrypt(stored: string, userId: string): string {
    const [version, iv, tag, data] = stored.split('.');
    if (version !== VERSION || !iv || !tag || !data) throw new Error('Secreto con formato desconocido');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    // final() lanza si la etiqueta no coincide: llave distinta, texto alterado o usuario distinto.
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
}
