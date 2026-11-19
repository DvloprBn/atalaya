#!/usr/bin/env python3
"""Genera el café ficticio de Atalaya: 3 sucursales, 2 años de ventas y gastos, con semilla fija.

    python3 scripts/generar_cafe.py            # escribe en datos-ejemplo/

Todo es inventado (negocio, productos, precios, cifras): no hay datos de personas ni de ningún negocio real.
Con la misma semilla sale SIEMPRE el mismo resultado (se comprueba con un hash), así que los CSV no se versionan:
se regeneran. Solo biblioteca estándar; el dinero es `Decimal`, nunca `float`.

Salida (en `datos-ejemplo/`):
  cafe-ventas.csv         ventas LIMPIAS: un renglón por sucursal, producto y día (≈ 26 000, bajo el tope de 50 000)
  cafe-ventas-sucio.csv   las mismas, con suciedad sembrada a propósito (para ver el informe de calidad)
  cafe-gastos.csv         gastos: renta, nómina, insumos, servicios, impuestos, mantenimiento…
  manifiesto.json         qué se sembró y dónde, para comparar contra lo que Atalaya encuentra
"""

import csv
import json
import random
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

SEED = 20261119
START, END = date(2024, 11, 18), date(2026, 11, 17)  # lunes … martes: 730 días
OUT = Path(__file__).resolve().parent.parent / "datos-ejemplo"
CENT = Decimal("0.01")

# (producto, precio, peso: qué tanto se vende respecto a los demás)
PRODUCTS = [
    ("Americano", 38, 14), ("Latte", 52, 16), ("Capuchino", 52, 13), ("Mocha", 58, 7), ("Frappé caramelo", 68, 8),
    ("Té chai", 48, 5), ("Croissant", 42, 9), ("Pan de elote", 35, 7), ("Rebanada de pastel", 65, 6),
    ("Sándwich de pollo", 89, 6), ("Galleta", 25, 7), ("Café en grano 1/2 kg", 185, 2),
]  # fmt: skip
BRANCHES = {"Centro": (START, Decimal("1.00")), "Norte": (START, Decimal("0.75")), "Sur": (date(2025, 3, 3), Decimal("0.60"))}
TICKETS = {0: 70, 1: 72, 2: 76, 3: 80, 4: 95, 5: 120, 6: 85}  # tickets de un día normal en Centro (lunes = 0)
SEASON = {1: .92, 2: .95, 3: 1.0, 4: 1.0, 5: 1.05, 6: .97, 7: .90, 8: .92, 9: 1.0, 10: 1.05, 11: 1.10, 12: 1.15}  # fmt: skip
LINES_PER_TICKET = 2.1
CLOSED = {date(2024, 12, 25), date(2025, 1, 1), date(2025, 12, 25), date(2026, 1, 1)}  # no hay renglones esos días
# Días que se salen de lo normal PARA TODO EL NEGOCIO (los debe encontrar el detector de anomalías).
EVENTS = {
    date(2025, 2, 14): (2.2, "San Valentín"), date(2025, 5, 10): (2.0, "Día de las Madres"),
    date(2025, 9, 19): (0.2, "tormenta: casi nadie salió"), date(2025, 11, 2): (1.8, "Día de Muertos"),
    date(2025, 12, 24): (0.45, "Nochebuena: medio día"), date(2026, 2, 14): (2.2, "San Valentín"),
    date(2026, 3, 20): (0.15, "apagón de la zona"),
}  # fmt: skip


def money(value: Decimal) -> str:
    return format(value.quantize(CENT, rounding=ROUND_HALF_UP), "f")


def sales(rng: random.Random):
    """(renglones, ventas por sucursal y día). Un renglón = (fecha, sucursal, producto, cantidad, importe)."""
    rows, daily = [], {}
    total_weight = sum(w for _, _, w in PRODUCTS)
    for n in range((END - START).days + 1):
        day = START + timedelta(days=n)
        if day in CLOSED:
            continue
        months = (day.year - START.year) * 12 + day.month - START.month
        base = TICKETS[day.weekday()] * (1 + 0.0125 * months) * SEASON[day.month] * EVENTS.get(day, (1, ""))[0]
        for branch, (opening, factor) in BRANCHES.items():
            if day < opening:
                continue
            ramp = min(1.0, 0.55 + 0.45 * ((day - opening).days / 7) / 12) if branch == "Sur" else 1.0  # las primeras 12 semanas
            units = base * float(factor) * ramp * (1 + rng.gauss(0, 0.06)) * LINES_PER_TICKET
            for name, price, weight in PRODUCTS:
                mean = units * weight / total_weight
                qty = max(0, round(rng.gauss(mean, mean**0.5)))
                if qty:
                    amount = Decimal(price) * qty
                    rows.append((day, branch, name, qty, amount))
                    daily[(branch, day)] = daily.get((branch, day), Decimal(0)) + amount
    return rows, daily


def expenses(rng: random.Random, daily: dict):
    """Gastos con el mismo calendario: renta el 1, nómina el 15 y el último día, insumos cada lunes (≈ 31 % de la semana)."""
    rows = []

    def add(day, category, branch, amount, tag):
        if START <= day <= END:
            rows.append((day, category, branch, Decimal(amount), f"{tag}-{day:%Y%m%d}"))

    rent = {"Centro": 18000, "Norte": 14500, "Sur": 11500}
    payroll = {"Centro": 38000, "Norte": 29000, "Sur": 22000}
    power = {"Centro": 3400, "Norte": 2800, "Sur": 2300}
    for year, month in [(y, m) for y in (2024, 2025, 2026) for m in range(1, 13)]:
        first, last = date(year, month, 1), (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1))
        for branch, (opening, _) in BRANCHES.items():
            if last < opening:
                continue
            raise_ = Decimal("1.03") if year == 2026 else Decimal(1)
            add(first, "Renta", branch, rent[branch], f"REN-{branch[0]}")
            for pay_day in (date(year, month, 15), last):
                add(pay_day, "Nómina", branch, (payroll[branch] * raise_ * Decimal(1 + rng.gauss(0, 0.01))).quantize(CENT), f"NOM-{branch[0]}")
            summer = Decimal("1.25") if 5 <= month <= 9 else Decimal(1)
            add(date(year, month, 10), "Luz", branch, (power[branch] * summer * Decimal(1 + rng.gauss(0, 0.05))).quantize(CENT), f"LUZ-{branch[0]}")
            add(date(year, month, 20), "Agua", branch, 650, f"AGU-{branch[0]}")
            add(date(year, month, 5), "Gas", branch, 900, f"GAS-{branch[0]}")
        add(date(year, month, 12), "Internet", "Todas", 800, "INT")
        add(date(year, month, 3), "Marketing", "Todas", 3500, "MKT")
        previous = date(year - (month == 1), (month - 2) % 12 + 1, 1)
        prior_sales = sum(v for (_, d), v in daily.items() if (d.year, d.month) == (previous.year, previous.month))
        add(date(year, month, 17), "Impuestos", "Todas", (prior_sales * Decimal("0.09")).quantize(CENT), "IMP")
    for branch, (opening, _) in BRANCHES.items():  # insumos: cada lunes, según lo vendido la semana anterior
        for n in range(7, (END - START).days + 1, 7):
            monday = START + timedelta(days=n)
            week = sum(daily.get((branch, monday - timedelta(days=k)), Decimal(0)) for k in range(1, 8))
            if week:
                add(monday, "Insumos", branch, (week * Decimal("0.31") * Decimal(1 + rng.gauss(0, 0.03))).quantize(CENT), f"INS-{branch[0]}")
    for day in sorted(rng.sample([START + timedelta(days=n) for n in range(30, 700)], 8)):
        add(day, "Mantenimiento", rng.choice(list(BRANCHES)), rng.randrange(500, 6500, 50), "MAN")
    add(date(2025, 8, 12), "Equipo", "Centro", 48500, "EQP")  # una compra grande e inesperada: la máquina de espresso
    add(date(2026, 6, 4), "Multa", "Norte", 7800, "MUL")
    return sorted(rows, key=lambda r: (r[0], r[1], r[2]))


def dirty(rng: random.Random, clean: list[list[str]]) -> tuple[list[list[str]], dict]:
    """La misma venta con suciedad sembrada. Se anota CUÁNTO de cada cosa para comparar con el informe de calidad."""
    rows = [list(r) for r in clean]
    pick = rng.sample(range(len(rows)), 40)
    manifest = {}
    for i in pick[:5]:
        rows[i][4] = "N/A"
    manifest["importe_ilegible (bad_amount)"] = 5
    for i in pick[5:9]:
        rows[i][0] = "31/02/2026"
    manifest["fecha_imposible (bad_date)"] = 4
    for i in pick[9:12]:
        rows[i][0] = "2027-03-01"
    manifest["fecha_futura (future_date)"] = 3
    for i in pick[12:20]:
        rows[i][2] = f"  {rows[i][2]}  "
    manifest["producto_con_espacios (text_trimmed)"] = 8
    big = [i for i in pick[20:] if float(rows[i][4]) >= 1000][:3] or pick[20:23]
    for i in big:
        rows[i][4] = f"${float(rows[i][4]):,.2f}"
    manifest["importe_con_$_y_comas (se lee bien)"] = len(big)
    extra = [list(rows[i]) for i in pick[23:29]]  # copias exactas de 6 renglones
    manifest["renglon_repetido (duplicate_row)"] = 6
    returns = []
    for i in pick[29:39]:  # 10 devoluciones: cantidad e importe negativos
        d, b, p, q, a = rows[i]
        if not a.startswith("$") and a != "N/A":
            returns.append([clean[i][0], b, p.strip(), f"-{min(int(q), 2)}", f"-{Decimal(clean[i][4]) / int(q) * min(int(q), 2):.2f}"])
    manifest["devoluciones (negative_amount)"] = len(returns)
    rows += extra + returns
    rows.append(["2025-06-02", "Centro", '=HYPERLINK("http://ejemplo.invalid","clic")', "1", "99.00"])  # inyección de fórmula (dominio ficticio)
    manifest["formula_en_el_producto (se neutraliza al exportar)"] = 1
    rows += [["", "", "", "", ""]] * 2
    manifest["renglon_vacio (blank_row)"] = 2
    rng.shuffle(rows)
    return rows, manifest


def write(name: str, header: list[str], rows) -> Path:
    OUT.mkdir(exist_ok=True)
    path = OUT / name
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    return path


def main() -> None:
    rng = random.Random(SEED)
    sale_rows, daily = sales(rng)
    clean = [[d.isoformat(), b, p, str(q), money(a)] for d, b, p, q, a in sale_rows]
    write("cafe-ventas.csv", ["fecha", "sucursal", "producto", "cantidad", "importe"], clean)
    messy, seeded = dirty(random.Random(SEED + 1), clean)
    write("cafe-ventas-sucio.csv", ["fecha", "sucursal", "producto", "cantidad", "importe"], messy)
    spend = expenses(random.Random(SEED + 2), daily)
    write("cafe-gastos.csv", ["fecha", "categoria", "sucursal", "importe", "folio"], [[d.isoformat(), c, b, money(a), f] for d, c, b, a, f in spend])
    manifest = {
        "semilla": SEED, "periodo": [START.isoformat(), END.isoformat()], "renglones_ventas": len(clean), "renglones_gastos": len(spend),
        "ventas_totales": money(sum((a for *_, a in sale_rows), Decimal(0))), "gastos_totales": money(sum((a for _, _, _, a, _ in spend), Decimal(0))),
        "dias_cerrados": sorted(d.isoformat() for d in CLOSED),
        "eventos_sembrados": {d.isoformat(): {"factor": f, "motivo": why} for d, (f, why) in sorted(EVENTS.items())},
        "suciedad_sembrada": seeded,
        "otros_gastos_notables": {"2025-08-12": "compra de máquina de espresso: 48 500.00 (Centro)", "2026-06-04": "multa: 7 800.00 (Norte)"},
    }
    (OUT / "manifiesto.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("renglones_ventas", "renglones_gastos", "ventas_totales", "gastos_totales")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
