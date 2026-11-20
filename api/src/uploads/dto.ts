import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional()
  @Type(() => Number) // la consulta llega como texto: "2" → 2
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

/**
 * v1.0 · Los campos de texto de la subida (multipart). Hoy solo la casilla de la demo: «Confirmo que no contiene datos
 * reales de personas». Llega como texto; solo «true» cuenta como marcada. Cualquier otro campo lo rechaza la validación.
 */
export class UploadFields {
  @IsOptional()
  @IsIn(['true', 'false'])
  noRealData?: 'true' | 'false';
}
