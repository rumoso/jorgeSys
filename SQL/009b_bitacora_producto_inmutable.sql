-- =============================================================================
-- 009b — La bitácora del producto no se edita ni se borra (análisis 009)
--
-- Disparadores que rechazan UPDATE y DELETE sobre bitacora_producto (LP-4).
-- Van aparte de 009_superadministrador_y_planes.sql porque, con el binlog
-- encendido, crear un disparador exige SUPER (o
-- log_bin_trust_function_creators = 1): se corre con el usuario
-- administrador de MySQL, una vez, después del 009.
--
--     mysql -u root -p db_truck_manager < SQL/009b_bitacora_producto_inmutable.sql
--
-- Idempotente. Rollback comentado al final.
-- =============================================================================

DROP TRIGGER IF EXISTS tr_bitacora_producto_sin_update;
DROP TRIGGER IF EXISTS tr_bitacora_producto_sin_delete;

DELIMITER $$
CREATE TRIGGER tr_bitacora_producto_sin_update BEFORE UPDATE ON bitacora_producto
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La bitácora del producto no se edita';
END$$

CREATE TRIGGER tr_bitacora_producto_sin_delete BEFORE DELETE ON bitacora_producto
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La bitácora del producto no se borra';
END$$
DELIMITER ;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DROP TRIGGER IF EXISTS tr_bitacora_producto_sin_delete;
-- DROP TRIGGER IF EXISTS tr_bitacora_producto_sin_update;
