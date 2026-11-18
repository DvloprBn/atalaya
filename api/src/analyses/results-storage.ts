import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../config/env.js';

const KEY = /^[0-9a-f]{32}$/;
export type ResultKind = 'clean' | 'report';
export const RESULT_KINDS: Record<ResultKind, ResultKind> = { clean: 'clean', report: 'report' };

/**
 * Los CSV de resultados. Los ESCRIBE el worker (en una carpeta compartida con bit sticky); la API solo los lee para
 * entregarlos y los borra. El nombre en disco es `<llave>.<clean|report>.csv`: la llave la generó la API y el tipo sale
 * de una lista cerrada, así que nada que escriba una persona llega a una ruta.
 */
@Injectable()
export class ResultsStorage {
  private readonly dir = loadEnv().resultsDir;

  /** Un flujo de lectura y su tamaño, o null si el archivo no está (se borró, o el worker aún no lo escribió). */
  async open(key: string, kind: ResultKind) {
    const path = this.pathOf(key, kind);
    try {
      const info = await stat(path);
      return info.isFile() ? { stream: createReadStream(path), size: info.size } : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /** Borra los dos CSV de un análisis. Que no existan no es un error. */
  async removeAll(key: string): Promise<void> {
    for (const kind of Object.values(RESULT_KINDS)) {
      await unlink(this.pathOf(key, kind)).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      });
    }
  }

  // Segunda barrera: aunque una llave llegara de otro lado, aquí se exige su forma exacta.
  private pathOf(key: string, kind: ResultKind): string {
    if (!KEY.test(key) || !(kind in RESULT_KINDS)) throw new Error('Resultado inválido');
    return join(this.dir, `${key}.${kind}.csv`);
  }
}
