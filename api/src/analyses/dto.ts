import { applyDecorators } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateAnalysisDto {
  @IsUUID()
  uploadId: string;

  /** Ventas o gastos. Por omisión, ventas (como en v0.9). */
  @IsOptional()
  @IsIn(['sales', 'expenses'])
  kind?: 'sales' | 'expenses';
}

/** `GET /profit`: los dos análisis a combinar. */
export class ProfitQuery {
  @IsUUID()
  sales: string;

  @IsUUID()
  expenses: string;
}

/** Una posición de columna: entero de 0 a 199 (el archivo tiene máximo 200 columnas). Un «3» en texto NO pasa. */
const Column = () => applyDecorators(IsInt(), Min(0), Max(199));
const OptionalColumn = () => applyDecorators(IsOptional(), Column());

/** El contrato (`Mapping`): `date` y `amount` obligatorios, los demás opcionales; cualquier otro campo da 400. */
export class MappingDto {
  @Column() date: number;
  @Column() amount: number;
  @OptionalColumn() quantity?: number;
  @OptionalColumn() product?: number;
  @OptionalColumn() branch?: number;
  @OptionalColumn() orderId?: number;
  @IsOptional() @IsIn(['auto', 'dmy', 'mdy', 'ymd']) dateOrder?: 'auto' | 'dmy' | 'mdy' | 'ymd';
  @IsOptional() @IsIn(['auto', '.', ',']) decimalSeparator?: 'auto' | '.' | ',';
}
