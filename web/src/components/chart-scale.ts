// Matemática de ESCALA para dibujar. Los números de aquí solo sirven para colocar marcas en pantalla (píxeles) y para los
// valores «redondos» del eje; los importes que se le muestran a la persona salen siempre del TEXTO exacto del contrato.

/** Valores redondos para el eje (1, 2 o 5 por una potencia de 10) que cubren de `min` a `max`. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return min === 0 ? [0, 1] : [Math.min(0, min), Math.max(0, min)];
  const rough = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks: number[] = [];
  const end = Math.ceil(max / step) * step;
  for (let t = Math.floor(min / step) * step; t <= end + step / 1e6; t += step) ticks.push(Math.round(t / step) * step);
  return ticks;
}

/** Un solo estilo por eje: completo bajo 10 000 (2,500) y compacto desde ahí (12 K, 1.5 M). */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 10_000) return value.toLocaleString('es-MX');
  const [divisor, suffix] = abs >= 1_000_000 ? [1_000_000, ' M'] : [1_000, ' K'];
  return `${Number((value / divisor).toFixed(1)).toLocaleString('es-MX')}${suffix}`;
}

/** Marca rectangular con el extremo de DATOS redondeado (4 px) y la base recta, que arranca en la línea base `y0`. */
export function barPath(x: number, width: number, y0: number, y: number, radius = 4): string {
  const height = Math.abs(y - y0);
  if (height === 0) return '';
  const r = Math.min(radius, width / 2, height);
  const w = width;
  return y < y0
    ? `M${x} ${y0}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y0}Z` // hacia arriba
    : `M${x} ${y0}V${y - r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y - r}V${y0}Z`; // hacia abajo
}
