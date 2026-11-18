-- =============================================================================
-- 015 — Ubicación de la sucursal en el mapa
--
-- Punto principal de la sucursal (opcional): latitud y longitud, las dos o
-- ninguna. Es el punto inicial de la geocerca del 010. El cambio queda en
-- bitacora_configuracion con el tipo nuevo UBICACION (LP-4).
--
-- No hay tablas nuevas: `sucursales` ya es tabla de empresa (LP-1).
--
-- Idempotente. Rollback comentado al final.
-- =============================================================================

-- ── Columnas ─────────────────────────────────────────────────────────────────
-- DECIMAL(9,6): 6 decimales ≈ 10 cm.

SET @tiene = (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursales' AND COLUMN_NAME = 'latitud');
SET @sql = IF(@tiene = 0,
    'ALTER TABLE sucursales ADD COLUMN latitud DECIMAL(9,6) NULL AFTER direccion',
    'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @tiene = (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursales' AND COLUMN_NAME = 'longitud');
SET @sql = IF(@tiene = 0,
    'ALTER TABLE sucursales ADD COLUMN longitud DECIMAL(9,6) NULL AFTER latitud',
    'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- ── Regla: las dos o ninguna, y dentro del rango ─────────────────────────────
-- El (0, 0) lo rechaza el Back con su mensaje (helpers/ubicacion.js).

SET @tiene = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sucursales'
                 AND CONSTRAINT_NAME = 'ck_sucursales_ubicacion');
SET @sql = IF(@tiene = 0,
    'ALTER TABLE sucursales ADD CONSTRAINT ck_sucursales_ubicacion CHECK (
        (latitud IS NULL AND longitud IS NULL)
        OR (latitud IS NOT NULL AND longitud IS NOT NULL
            AND latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180))',
    'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- ── Bitácora: tipo UBICACION ─────────────────────────────────────────────────
-- Repetible: deja el ENUM con la lista completa.

ALTER TABLE bitacora_configuracion
    MODIFY COLUMN tipo ENUM('AJUSTE','CONFIRMACION','EXCEPCION','ZONA','CONSTANTE','UBICACION') NOT NULL;

-- =============================================================================
-- ROLLBACK (solo en pruebas; borra la ubicación de todas las sucursales y su
-- bitácora)
-- =============================================================================
-- DELETE FROM bitacora_configuracion WHERE tipo = 'UBICACION';
-- ALTER TABLE bitacora_configuracion
--     MODIFY COLUMN tipo ENUM('AJUSTE','CONFIRMACION','EXCEPCION','ZONA','CONSTANTE') NOT NULL;
-- ALTER TABLE sucursales DROP CHECK ck_sucursales_ubicacion;
-- ALTER TABLE sucursales DROP COLUMN longitud, DROP COLUMN latitud;
