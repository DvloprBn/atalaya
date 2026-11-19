#!/usr/bin/env python3
"""Genera CFDI 4.0 SINTÉTICOS del café ficticio, con semilla fija, para probar la subida de XML y ZIP (v0.11).

    python3 scripts/generar_cfdi.py            # escribe en datos-ejemplo/

Todo es inventado. El RFC del emisor es el de pruebas que publica el SAT (EKU9003173C9) y el del receptor es el genérico
de «público en general»: no hay personas ni negocios reales. NO llevan sello válido (SelloCFD de relleno): Atalaya no valida
timbrado, solo lee. Solo biblioteca estándar; el dinero es `Decimal`. Con la misma semilla sale siempre lo mismo.

Salida (en `datos-ejemplo/`):
  cfdi-cafe.zip     60 comprobantes: 54 de ingreso (MXN), 2 de egreso (notas de crédito), 2 de pago y 2 en USD
                    (los últimos cuatro Atalaya los DESCARTA y los cuenta)
  cfdi-uno.xml      un solo comprobante de ingreso, para probar el `.xml` suelto
  manifiesto-cfdi.json  total esperado y descartes, para compararlos contra lo que Atalaya encuentre
"""

import json
import random
import uuid as uuidlib
import zipfile
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

SEED = 20261119
OUT = Path(__file__).resolve().parent.parent / "datos-ejemplo"
CENT = Decimal("0.01")
NS = "http://www.sat.gob.mx/cfd/4"
TFD = "http://www.sat.gob.mx/TimbreFiscalDigital"
PRODUCTS = [("Latte", "52.00"), ("Americano", "38.00"), ("Croissant", "42.00"), ("Sándwich de pollo", "89.00"), ("Galleta", "25.00")]


def q(value: Decimal) -> str:
    return format(value.quantize(CENT, rounding=ROUND_HALF_UP), "f")


def comprobante(rng: random.Random, n: int, tipo: str, moneda: str) -> tuple[bytes, Decimal]:
    """Un CFDI y su importe neto (lo que Atalaya debe sumar: ingreso suma, egreso resta, lo demás nada)."""
    when = datetime(2026, 1, 5, 9) + timedelta(days=n * 3, minutes=rng.randrange(600))
    items, total = [], Decimal(0)
    for _ in range(rng.randint(1, 3)):
        name, price = rng.choice(PRODUCTS)
        qty = rng.randint(1, 4)
        amount = Decimal(price) * qty
        total += amount
        items.append(
            f'<cfdi:Concepto ClaveProdServ="90101501" Cantidad="{qty}" ClaveUnidad="H87" Descripcion="{name}" '
            f'ValorUnitario="{price}" Importe="{q(amount)}" ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados>'
            f'<cfdi:Traslado Base="{q(amount)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="{q(amount * Decimal("0.16"))}"/>'
            "</cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>"
        )
    folio = f"{tipo}{n:03d}"
    uid = str(uuidlib.UUID(int=rng.getrandbits(128), version=4)).upper()
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<cfdi:Comprobante xmlns:cfdi="{NS}" xmlns:tfd="{TFD}" Version="4.0" Serie="CAFE" Folio="{folio}" '
        f'Fecha="{when:%Y-%m-%dT%H:%M:%S}" TipoDeComprobante="{tipo}" Moneda="{moneda}" SubTotal="{q(total)}" Total="{q(total * Decimal("1.16"))}" LugarExpedicion="76000">'
        '<cfdi:Emisor Rfc="EKU9003173C9" Nombre="ESCUELA KEMPER URGATE" RegimenFiscal="601"/>'
        '<cfdi:Receptor Rfc="XAXX010101000" Nombre="PUBLICO EN GENERAL" UsoCFDI="S01"/>'
        f"<cfdi:Conceptos>{''.join(items)}</cfdi:Conceptos>"
        f'<cfdi:Complemento><tfd:TimbreFiscalDigital UUID="{uid}" FechaTimbrado="{when:%Y-%m-%dT%H:%M:%S}" SelloCFD="RELLENO" NoCertificadoSAT="00000000000000000000"/></cfdi:Complemento>'
        "</cfdi:Comprobante>"
    )
    net = {"I": total, "E": -total}.get(tipo, Decimal(0)) if moneda == "MXN" else Decimal(0)
    return xml.encode(), net


def main() -> None:
    rng = random.Random(SEED)
    plan = [("I", "MXN")] * 54 + [("E", "MXN")] * 2 + [("P", "MXN")] * 2 + [("I", "USD")] * 2
    OUT.mkdir(exist_ok=True)
    expected, one = Decimal(0), b""
    with zipfile.ZipFile(OUT / "cfdi-cafe.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for n, (tipo, moneda) in enumerate(plan, 1):
            data, net = comprobante(rng, n, tipo, moneda)
            expected += net
            one = one or data
            z.writestr(zipfile.ZipInfo(f"cfdi-{n:03d}.xml", (2026, 11, 19, 0, 0, 0)), data)
    (OUT / "cfdi-uno.xml").write_bytes(one)
    manifest = {"comprobantes": len(plan), "neto_esperado_sin_iva": q(expected), "descartados": {"unsupported_document": 2, "unsupported_currency": 2}}
    (OUT / "manifiesto-cfdi.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(manifest)


if __name__ == "__main__":
    main()
