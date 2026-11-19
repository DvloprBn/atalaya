"""Los motivos de rechazo son una lista CERRADA (la misma del contrato y del CHECK de la base)."""

REASONS = frozenset(
    {
        "zip_bomb", "too_many_entries", "range_too_large", "corrupt", "empty", "worker_timeout", "not_cfdi",
        "encrypted", "active_content", "no_text_layer", "no_table",  # solo de PDF (v0.12)
    }
)  # fmt: skip


class Reject(Exception):  # noqa: N818 - no es un «error»: es el resultado normal de revisar un archivo malo
    """El archivo no pasó la revisión. Lleva SOLO un motivo de la lista, nunca texto del archivo."""

    def __init__(self, reason: str) -> None:
        if reason not in REASONS:
            raise ValueError(f"motivo desconocido: {reason}")
        super().__init__(reason)
        self.reason = reason
