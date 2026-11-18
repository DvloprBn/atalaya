"""Los motivos de fallo de un análisis son una lista CERRADA (la del contrato y la del CHECK de la base)."""

FAIL_REASONS = frozenset({"unreadable", "no_header", "too_few_columns", "mapping_invalid", "nothing_left", "worker_timeout"})


class AnalysisFail(Exception):  # noqa: N818 - es un resultado normal («este archivo no sirve»), no un error del programa
    """El análisis no puede continuar. Lleva SOLO un motivo de la lista, nunca texto del archivo."""

    def __init__(self, reason: str) -> None:
        if reason not in FAIL_REASONS:
            raise ValueError(f"motivo desconocido: {reason}")
        super().__init__(reason)
        self.reason = reason
