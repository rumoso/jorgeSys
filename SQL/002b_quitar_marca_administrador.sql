-- =============================================================================
-- 002b — Quitar la marca provisional de administrador (análisis 001 → 002)
-- Se aplica DESPUÉS de 002_menus_acciones_roles.sql, cuando ya nada la lee:
-- desde el 002 el administrador es quien tiene el rol protegido.
-- Idempotente. Rollback comentado al final.
-- =============================================================================

-- Por seguridad, antes de quitarla: quien la tenía y todavía no tiene el
-- rol Administrador lo recibe (lo mismo que hace la migración del 002).
SET @tiene_marca = (SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios_empresa'
                       AND COLUMN_NAME = 'bAdministrador');

SET @sql = IF(@tiene_marca > 0,
    'INSERT IGNORE INTO usuarios_empresa_roles (idEmpresa, idUsuario, idRol)
     SELECT ue.idEmpresa, ue.idUsuario, r.idRol
       FROM usuarios_empresa ue
       JOIN roles r ON r.idEmpresa = ue.idEmpresa AND r.plantilla = ''ADMINISTRADOR''
      WHERE ue.bAdministrador = 1',
    'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @sql = IF(@tiene_marca > 0, 'ALTER TABLE usuarios_empresa DROP COLUMN bAdministrador', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- =============================================================================
-- ROLLBACK (regresa la columna y la llena con quien tiene el rol Administrador)
-- =============================================================================
-- ALTER TABLE usuarios_empresa ADD COLUMN bAdministrador TINYINT(1) NOT NULL DEFAULT 0 AFTER bActivo;
-- UPDATE usuarios_empresa ue
--   JOIN usuarios_empresa_roles uer ON uer.idEmpresa = ue.idEmpresa AND uer.idUsuario = ue.idUsuario
--   JOIN roles r ON r.idEmpresa = uer.idEmpresa AND r.idRol = uer.idRol AND r.bProtegido = 1
--    SET ue.bAdministrador = 1;
