# Imagen del worker en dos etapas: la primera instala dependencias con uv;
# la segunda solo lleva Python, el entorno virtual y el código (sin uv ni compiladores).
FROM python:3.14-slim AS build
RUN pip install --no-cache-dir uv==0.13.9
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY pyproject.toml uv.lock ./
# --frozen: instala EXACTAMENTE lo del uv.lock; si no coincide con pyproject.toml, falla.
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.14-slim
# Usuario propio sin shell ni carpeta personal: si alguien lograra ejecutar código aquí, no es root.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin worker
# Carpeta de resultados (la misma forma que en la imagen de la API, para que el volumen salga igual lo cree quien lo cree):
# dueño uid 1000 (el de la API) + sticky 1777; el worker (10001) crea sus archivos y no puede borrar los ajenos.
RUN mkdir -p /data/results && chown 1000:1000 /data/results && chmod 1777 /data/results
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY atalaya_worker ./atalaya_worker
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER worker
CMD ["python", "-m", "atalaya_worker"]
