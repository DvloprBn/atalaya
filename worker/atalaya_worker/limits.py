"""Los topes de la revisión profunda. Un archivo hostil se mide contra ESTOS números, no contra lo que él diga de sí mismo."""

MAX_ROWS = 50_000  # filas por hoja o por CSV (el mismo tope del demo de v1.0)
MAX_COLS = 200
MAX_ZIP_ENTRIES = 500  # un .xlsx normal tiene unas 10-30 entradas
MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024  # lo que puede ocupar TODO el zip ya descomprimido (el original pesa ≤ 5 MB)
MAX_RATIO = 100  # descomprimido / comprimido; un .xlsx real ronda 5-20
MAX_XML_BYTES = 40 * 1024 * 1024  # un solo XML interno
CHUNK = 64 * 1024
SECONDS_PER_FILE = 20  # tiempo máximo de revisión de un archivo (el latido caduca a los 30 s)
