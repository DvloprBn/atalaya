#!/bin/sh
# v1.0 · Datos de ejemplo para la demo: los genera (deterministas, misma semilla = mismos bytes) y deja una copia en
# web/public/ejemplos/, de donde la pantalla de «Mis archivos» los ofrece para descargar. No se versionan.
# Correr ANTES de construir la imagen del frontend (web/Dockerfile se niega a construir sin ellos).
set -eu
cd "$(dirname "$0")/.."

python3 scripts/generar_cafe.py
python3 scripts/generar_cfdi.py
python3 scripts/generar_pdf.py

dest=web/public/ejemplos
mkdir -p "$dest"
for f in cafe-ventas.csv cafe-ventas-sucio.csv cafe-gastos.csv cfdi-cafe.zip reporte-ventas.pdf; do
  cp "datos-ejemplo/$f" "$dest/$f"
done
echo "Datos de ejemplo listos en $dest:"
ls -l "$dest"
