import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional()
  @Type(() => Number) // la consulta llega como texto: "2" → 2
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}
