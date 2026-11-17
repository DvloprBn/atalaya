import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// Postgres no acepta el byte nulo (U+0000) en un texto: sin este filtro, un
// "\u0000" en cualquier campo llegaba a la base y respondía 500 (lección 248).
// Se rechaza con 400 ANTES de validar nada, en ruta, consulta y cuerpo.
@Injectable()
export class NoNullBytesPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (containsNullByte(value)) throw new BadRequestException('Carácter no permitido');
    return value;
  }
}

function containsNullByte(value: unknown, depth = 0): boolean {
  if (depth > 10) return false; // los DTO no anidan tanto; evita recorridos infinitos
  if (typeof value === 'string') return value.includes('\u0000');
  if (Array.isArray(value)) return value.some((item) => containsNullByte(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k.includes('\u0000') || containsNullByte(v, depth + 1));
  }
  return false;
}
