"""Los topes de la revisión profunda. Un archivo hostil se mide contra ESTOS números, no contra lo que él diga de sí mismo."""

MAX_ROWS = 50_000  # filas por hoja o por CSV (el mismo tope del demo de v1.0)
MAX_COLS = 200
MAX_ZIP_ENTRIES = 500  # un .xlsx normal tiene unas 10-30 entradas
MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024  # lo que puede ocupar TODO el zip ya descomprimido (el original pesa ≤ 5 MB)
MAX_RATIO = 100  # descomprimido / comprimido; un .xlsx real ronda 5-20
MAX_XML_BYTES = 40 * 1024 * 1024  # un solo XML interno
CHUNK = 64 * 1024
SECONDS_PER_FILE = 20  # tiempo máximo de revisión de un archivo (el latido caduca a los 30 s)

# ── Análisis (v0.9) ──
MAX_TEXT = 200  # texto de producto, sucursal o pedido; más se recorta (y se cuenta)
SAMPLE_LEN = 40  # ejemplos de la vista previa y del informe: son DATO del archivo, se muestran recortados
NAME_LEN = 60  # encabezados de columna
MAX_ABS_AMOUNT = 10**12  # un importe mayor es un error de captura, no una venta
MAX_DECIMALS = 6
SECONDS_PER_ANALYSIS = 60  # leer y limpiar 50 000 filas; el latido va en otro hilo, así que no caduca
EXAMPLES_PER_ISSUE = 5

# ── CFDI (v0.11) ──
MAX_CFDI_BYTES = 1024 * 1024  # un comprobante real pesa unos KB; 1 MB ya es mucho
MAX_XML_DEPTH = 20  # un CFDI anida unos 6 niveles
MAX_XML_ELEMENTS = 50_000
MAX_ATTR_CHARS = 4_000  # un atributo más largo es un ataque o un error, no un dato

# ── PDF (v0.12) ── Se leen en un PROCESO HIJO con estos topes (ver pdf_reader.py y pdf_child.py).
MAX_PDF_PAGES = 50
PDF_WALL_SECONDS = 15  # reloj de pared del hijo: por debajo de los 20 s de la revisión, para que el hijo muera primero
PDF_CPU_SECONDS = 15  # RLIMIT_CPU: el núcleo lo mata aunque se cuelgue dentro de código que no atiende señales
# RLIMIT_AS del hijo: una bomba de descompresión choca aquí y no con los 512 MB del contenedor.
PDF_MEMORY_BYTES = 384 * 1024 * 1024
MAX_PDF_OBJECTS = 100_000  # un reporte de 50 páginas tiene unos cientos
MAX_PDF_DEPTH = 32  # diccionarios dentro de diccionarios: un PDF real anida unos 5 niveles
MAX_PDF_CELL = 1_000  # caracteres por celda; la limpieza recorta a 200 y lo cuenta
MAX_PDF_OUTPUT = 32 * 1024 * 1024  # lo que el hijo puede devolver: más es un archivo hostil, no un reporte
