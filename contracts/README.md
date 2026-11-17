# Contratos

Los acuerdos entre las piezas de Atalaya. Si cambia uno, cambian **todas** las piezas que lo usan, en el mismo PR.

| Contrato | Entre | Dónde |
|---|---|---|
| API HTTP | navegador y `web` → `api` | [`openapi.yaml`](openapi.yaml) |
| Latido del worker | `worker` → Redis → `api` | Llave `atalaya:worker:heartbeat`, valor = fecha ISO 8601 en UTC, vigencia 30 s, se escribe cada 10 s. Código: `worker/atalaya_worker/heartbeat.py` y `api/src/health/health.service.ts` |

En v0.7 se agrega aquí la cola de análisis (Redis Streams).
