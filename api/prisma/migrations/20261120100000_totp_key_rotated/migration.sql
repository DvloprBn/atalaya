-- v1.0 · S-9 (rotación de la llave del 2FA). Escrita a mano: no cambia el esquema de Prisma (`action` es VARCHAR(32)).
-- Solo AMPLÍA el conjunto cerrado de acciones de auditoría con `totp_key_rotated`: compatible hacia atrás,
-- ninguna fila actual puede violar la restricción nueva. Esa acción la escribe el SISTEMA: actor y destino van en NULL.
ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_action_known",
  ADD CONSTRAINT "audit_logs_action_known" CHECK ("action" IN (
    'user_created', 'role_changed', 'user_disabled', 'user_enabled',
    'two_factor_enabled', 'two_factor_disabled', 'recovery_codes_regenerated',
    'totp_key_rotated'));
