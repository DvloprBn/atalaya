# Datos de ejemplo: el café ficticio

Un negocio **inventado** (nada de esto es real ni de nadie): 3 sucursales (Centro, Norte y Sur, que abre en marzo de 2025), 730 días
(2024-11-18 → 2026-11-17), ventas y gastos. Sirve para probar Atalaya con volumen y para la demo de v1.0.

```bash
python3 scripts/generar_cafe.py     # solo biblioteca estándar; escribe aquí mismo
```

Con la misma semilla sale **siempre lo mismo** (se comprueba con hashes), por eso los `.csv` y `manifiesto.json` **no se versionan**:
se regeneran. `manifiesto.json` dice exactamente qué se sembró para compararlo con lo que Atalaya encuentra.

| Archivo | Qué es | Tamaño |
|---|---|---|
| `cafe-ventas.csv` | Ventas **limpias**: un renglón por sucursal, producto y día (`fecha, sucursal, producto, cantidad, importe`) | ≈ 24 700 renglones, 1 MB |
| `cafe-ventas-sucio.csv` | Las mismas, con **suciedad sembrada** (importes ilegibles, fechas imposibles o futuras, espacios, renglones repetidos o vacíos, devoluciones, `$1,234.50` y una fórmula `=HYPERLINK(…)` con dominio ficticio) | ≈ 24 700 renglones |
| `cafe-gastos.csv` | Gastos (`fecha, categoria, sucursal, importe, folio`): renta, nómina, insumos, servicios, impuestos, mantenimiento, una máquina de espresso y una multa | ≈ 790 renglones |

Un renglón por sucursal, producto y día (y no por ticket) porque Atalaya lee hasta **50 000 filas** por archivo.

## Qué trae sembrado

- **Siete días fuera de lo normal** para todo el negocio: San Valentín (×2,2, dos años), Día de las Madres (×2,0), Día de Muertos (×1,8),
  una tormenta (×0,2), Nochebuena (×0,45) y un apagón (×0,15). Cuatro días cerrados (25-dic y 1-ene).
- **Tendencia y temporada:** crece ≈ 1,25 % al mes, con más ventas en noviembre y diciembre y menos en julio y enero, y más los viernes y sábados.
- **Suciedad** (solo en `cafe-ventas-sucio.csv`): 5 importes ilegibles, 4 fechas imposibles, 3 futuras, 8 productos con espacios, 6 renglones repetidos,
  8 devoluciones, 2 renglones vacíos, 3 importes con `$` y comas, 1 fórmula en el producto.

## Qué encontró Atalaya (2026-11-19)

Ventas limpias: total **18 081 166.00**, idéntico al centavo al del manifiesto; los **7 eventos** aparecen entre las anomalías y hay 1 falso
positivo (el sábado 2024-12-21, a 5 semanas del inicio de la serie, donde solo hay vecinos de un lado y la temporada sube). Pronóstico con backtest
de 7,2 % de error. Gastos: total **12 885 026.79**, idéntico al manifiesto; Pareto: Insumos 43,4 %, Nómina 32,4 % e Impuestos 12,3 % son la clase A;
no hay anomalías ni pronóstico (son gastos espaciados y lo dice). Ventas sucias: encontró 2 vacías, 6 repetidas, 4 fechas imposibles, 3 futuras y 5 importes ilegibles, tal cual se sembraron.
