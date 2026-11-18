import { Injectable } from '@nestjs/common';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../config/env.js';

const KEY = /^[0-9a-f]{32}$/;

/**
 * Los bytes de los archivos subidos. El nombre en disco es SIEMPRE una llave generada por el servidor
 * (32 hexadecimales); lo que el usuario llamó a su archivo nunca toca el sistema de archivos, así que
 * no hay forma de escribir fuera de la carpeta (`../`, rutas absolutas, enlaces).
 */
@Injectable()
export class UploadStorage {
  private readonly dir = loadEnv().uploadDir;

  /** `wx`: falla si ya existe (nunca pisa un archivo). 0644: el worker (otro usuario, solo lectura) debe poder leerlo. */
  async save(key: string, bytes: Buffer): Promise<void> {
    await writeFile(this.pathOf(key), bytes, { flag: 'wx', mode: 0o644 });
  }

  /** Borrar lo que ya no existe no es un error. */
  async remove(key: string): Promise<void> {
    await unlink(this.pathOf(key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }

  // Segunda barrera: aunque algún día una llave llegara de otro lado, aquí se exige su forma exacta.
  private pathOf(key: string): string {
    if (!KEY.test(key)) throw new Error('Llave de archivo inválida');
    return join(this.dir, key);
  }
}
