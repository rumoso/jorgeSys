-- =============================================================================
-- 009 — Superadministrador, alta de empresas y planes (análisis 009)
--
-- El panel del producto es la ÚNICA excepción a LP-1: sus tablas no llevan
-- idEmpresa (o lo llevan solo como dato) y solo las toca `db.panel(req)`.
--
--   Del panel (TABLAS_PANEL): superadmins, cat_planes, bitacora_producto.
--   De empresa (TABLAS_EMPRESA): empresas_planes, empresas_historial,
--   empresas_conteo_diario, empresas_exportaciones, soporte_sesiones.
--   Cambios: estados EN_BAJA y ELIMINADA en empresas, e idSesionSoporte en
--   las bitácoras de la empresa (lo hecho por soporte).
--
-- La lista que manda está en back/helpers/tablasEmpresa.js.
-- Idempotente. Rollback comentado al final.
-- =============================================================================

-- Columna o índice nuevo solo si no existe (se borra al final del script).
DROP PROCEDURE IF EXISTS sp_009_alter_si_falta;

DELIMITER $$
CREATE PROCEDURE sp_009_alter_si_falta(IN pTabla VARCHAR(64), IN pTipo VARCHAR(10), IN pNombre VARCHAR(64), IN pAlter VARCHAR(1000))
BEGIN
    DECLARE n INT DEFAULT 0;
    IF pTipo = 'COLUMNA' THEN
        SELECT COUNT(*) INTO n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = pTabla AND COLUMN_NAME = pNombre;
    ELSEIF pTipo = 'INDICE' THEN
        SELECT COUNT(*) INTO n FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = pTabla AND INDEX_NAME = pNombre;
    ELSE
        SELECT COUNT(*) INTO n FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = pTabla AND CONSTRAINT_NAME = pNombre;
    END IF;
    IF n = 0 THEN
        SET @sql_009 = pAlter;
        PREPARE st_009 FROM @sql_009;
        EXECUTE st_009;
        DEALLOCATE PREPARE st_009;
    END IF;
END$$
DELIMITER ;

-- ── Del panel (sin idEmpresa) ────────────────────────────────────────────────

-- Cuenta aparte de `usuarios`: un usuario de empresa nunca es superadministrador.
CREATE TABLE IF NOT EXISTS superadmins (
    idSuperadmin        INT          NOT NULL AUTO_INCREMENT,
    correo              VARCHAR(150) NOT NULL,
    nombre              VARCHAR(150) NOT NULL,
    passwordHash        VARCHAR(100) NOT NULL,
    -- Secreto TOTP cifrado con AES-256-GCM (PANEL_TOTP_KEY del .env).
    totpSecreto         VARCHAR(255) NULL,
    -- Último paso de 30 s aceptado: un código no se acepta dos veces.
    totpUltimoPaso      BIGINT       NULL,
    bActivo             TINYINT(1)   NOT NULL DEFAULT 1,
    -- Sube al desactivar, cambiar la contraseña o restablecer el segundo
    -- factor: invalida los tokens del panel de esta cuenta.
    versionSesion       INT          NOT NULL DEFAULT 1,
    ultimoAcceso        DATETIME     NULL,
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion   DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idSuperadmin),
    UNIQUE KEY uq_superadmins_correo (correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Planes del producto. LIMITE: hasta `limiteEmpleados` activos por `precio`
-- fijo. POR_EMPLEADO: `precio` por cada empleado activo (máximo del mes).
CREATE TABLE IF NOT EXISTS cat_planes (
    idPlan              INT           NOT NULL AUTO_INCREMENT,
    nombre              VARCHAR(100)  NOT NULL,
    tipoCobro           ENUM('LIMITE','POR_EMPLEADO') NOT NULL,
    limiteEmpleados     INT           NULL,
    precio              DECIMAL(12,2) NOT NULL DEFAULT 0,
    bActivo             TINYINT(1)    NOT NULL DEFAULT 1,
    fechaAlta           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion   DATETIME      NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idPlan),
    UNIQUE KEY uq_cat_planes_nombre (nombre),
    CONSTRAINT ck_cat_planes_tipo CHECK (
        (tipoCobro = 'LIMITE' AND limiteEmpleados IS NOT NULL AND limiteEmpleados > 0)
        OR (tipoCobro = 'POR_EMPLEADO' AND limiteEmpleados IS NULL)),
    CONSTRAINT ck_cat_planes_precio CHECK (precio >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Todo lo que hace un superadministrador (LP-4). No se edita ni se borra:
-- lo rechazan los disparadores de 009b_bitacora_producto_inmutable.sql (van
-- aparte porque crearlos exige un usuario con más privilegios) y el guardián
-- (scripts/auditar-empresa.js) falla si el código la actualiza o la borra. `idEmpresa` es un dato (nulo si no
-- aplica) y no tiene llave: la fila sobrevive a la eliminación de la empresa.
CREATE TABLE IF NOT EXISTS bitacora_producto (
    idBitacora          BIGINT        NOT NULL AUTO_INCREMENT,
    idSuperadmin        INT           NULL,         -- nulo: script en el servidor
    nombreSuperadmin    VARCHAR(150)  NOT NULL,
    accion              VARCHAR(60)   NOT NULL,     -- ENTRADA, EMPRESA_ALTA, PLAN_CAMBIO…
    idEmpresa           INT           NULL,
    objeto              VARCHAR(150)  NULL,         -- clave de la constante, id del plan…
    antes               JSON          NULL,
    despues             JSON          NULL,
    motivo              VARCHAR(500)  NULL,
    ip                  VARCHAR(64)   NULL,
    fecha               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idBitacora),
    KEY ix_bpr_fecha (fecha),
    KEY ix_bpr_superadmin (idSuperadmin, fecha),
    KEY ix_bpr_empresa (idEmpresa, fecha),
    KEY ix_bpr_accion (accion, fecha),
    CONSTRAINT fk_bpr_superadmin FOREIGN KEY (idSuperadmin) REFERENCES superadmins (idSuperadmin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── De empresa ───────────────────────────────────────────────────────────────

-- Estados nuevos: EN_BAJA (periodo de gracia, reversible) y ELIMINADA (solo
-- queda el registro de que existió). Repetible: deja la lista completa.
ALTER TABLE empresas
    MODIFY COLUMN estado ENUM('ACTIVA','SUSPENDIDA','EN_BAJA','ELIMINADA') NOT NULL DEFAULT 'ACTIVA';

CALL sp_009_alter_si_falta('empresas', 'COLUMNA', 'motivoEstado',
    'ALTER TABLE empresas ADD COLUMN motivoEstado VARCHAR(500) NULL AFTER estado');
CALL sp_009_alter_si_falta('empresas', 'COLUMNA', 'fechaEstado',
    'ALTER TABLE empresas ADD COLUMN fechaEstado DATETIME NULL AFTER motivoEstado');
CALL sp_009_alter_si_falta('empresas', 'COLUMNA', 'fechaBajaProgramada',
    'ALTER TABLE empresas ADD COLUMN fechaBajaProgramada DATETIME NULL AFTER fechaEstado');
CALL sp_009_alter_si_falta('empresas', 'COLUMNA', 'fechaEliminacion',
    'ALTER TABLE empresas ADD COLUMN fechaEliminacion DATETIME NULL AFTER fechaBajaProgramada');

-- Plan de cada empresa con su historial. fechaFin NULL = vigente; la columna
-- `vigente` (1 o NULL) hace que solo pueda haber UNO vigente por empresa.
CREATE TABLE IF NOT EXISTS empresas_planes (
    idEmpresaPlan       INT           NOT NULL AUTO_INCREMENT,
    idEmpresa           INT           NOT NULL,
    idPlan              INT           NOT NULL,
    fechaInicio         DATE          NOT NULL,
    fechaFin            DATE          NULL,
    precioEspecial      DECIMAL(12,2) NULL,         -- NULL = el precio del plan
    vigente             TINYINT       AS (IF(fechaFin IS NULL, 1, NULL)) STORED,
    idSuperadmin        INT           NULL,         -- nulo: script o migración
    fechaRegistro       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresaPlan),
    UNIQUE KEY uq_empresas_planes_vigente (idEmpresa, vigente),
    KEY ix_empresas_planes_plan (idPlan),
    CONSTRAINT fk_ep_empresa    FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_ep_plan       FOREIGN KEY (idPlan) REFERENCES cat_planes (idPlan),
    CONSTRAINT fk_ep_superadmin FOREIGN KEY (idSuperadmin) REFERENCES superadmins (idSuperadmin),
    CONSTRAINT ck_ep_fechas     CHECK (fechaFin IS NULL OR fechaFin >= fechaInicio),
    CONSTRAINT ck_ep_precio     CHECK (precioEspecial IS NULL OR precioEspecial >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lo que le pasó a la empresa (alta, suspensiones, bajas, planes, módulos).
-- Se conserva aunque la empresa se elimine.
CREATE TABLE IF NOT EXISTS empresas_historial (
    idHistorial         BIGINT        NOT NULL AUTO_INCREMENT,
    idEmpresa           INT           NOT NULL,
    tipo                ENUM('ALTA','SUSPENSION','REACTIVACION','BAJA','BAJA_REVERTIDA',
                             'ELIMINACION','PLAN','MODULOS') NOT NULL,
    detalle             VARCHAR(1000) NULL,
    motivo              VARCHAR(500)  NULL,
    idSuperadmin        INT           NULL,         -- nulo: script o migración
    fecha               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idHistorial),
    KEY ix_empresas_historial (idEmpresa, fecha),
    CONSTRAINT fk_eh_empresa    FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_eh_superadmin FOREIGN KEY (idSuperadmin) REFERENCES superadmins (idSuperadmin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Empleados activos por día (día de `producto.zona_horaria`). El número del
-- mes es el máximo del mes. Repetible el mismo día (se sobrescribe).
CREATE TABLE IF NOT EXISTS empresas_conteo_diario (
    idEmpresa           INT          NOT NULL,
    fecha               DATE         NOT NULL,
    empleadosActivos    INT          NOT NULL,
    fechaRegistro       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa, fecha),
    CONSTRAINT fk_ecd_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportaciones completas de la empresa (baja definitiva). El archivo vive
-- en almacen/empresas/<idEmpresa>/ con nombre aleatorio (helpers/archivos.js).
CREATE TABLE IF NOT EXISTS empresas_exportaciones (
    idExportacion       INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    archivo             VARCHAR(255) NOT NULL,
    tamano              BIGINT       NOT NULL DEFAULT 0,     -- bytes
    idSuperadmin        INT          NULL,
    fecha               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idExportacion),
    KEY ix_empresas_exportaciones (idEmpresa, fecha),
    CONSTRAINT fk_eex_empresa    FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_eex_superadmin FOREIGN KEY (idSuperadmin) REFERENCES superadmins (idSuperadmin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada entrada del superadministrador a una empresa (soporte). La empresa la
-- consulta en su Configuración. `fin` NULL = abierta (hasta `vence`).
CREATE TABLE IF NOT EXISTS soporte_sesiones (
    idSesionSoporte     INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idSuperadmin        INT          NOT NULL,
    nombreSuperadmin    VARCHAR(150) NOT NULL,
    motivo              VARCHAR(500) NOT NULL,
    inicio              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vence               DATETIME     NOT NULL,
    fin                 DATETIME     NULL,
    PRIMARY KEY (idSesionSoporte),
    -- Para las referencias compuestas desde las bitácoras de la empresa.
    UNIQUE KEY uq_soporte_sesiones_empresa (idEmpresa, idSesionSoporte),
    KEY ix_soporte_sesiones_superadmin (idSuperadmin, inicio),
    CONSTRAINT fk_ss_empresa    FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_ss_superadmin FOREIGN KEY (idSuperadmin) REFERENCES superadmins (idSuperadmin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bitácoras de la empresa: lo hecho por soporte lleva su sesión (y
-- idUsuarioAutor nulo). Referencia compuesta: la sesión es de la MISMA empresa.
CALL sp_009_alter_si_falta('bitacora_permisos', 'COLUMNA', 'idSesionSoporte',
    'ALTER TABLE bitacora_permisos ADD COLUMN idSesionSoporte INT NULL AFTER idUsuarioAutor');
CALL sp_009_alter_si_falta('bitacora_permisos', 'FK', 'fk_bp_soporte',
    'ALTER TABLE bitacora_permisos ADD CONSTRAINT fk_bp_soporte FOREIGN KEY (idEmpresa, idSesionSoporte) REFERENCES soporte_sesiones (idEmpresa, idSesionSoporte)');

CALL sp_009_alter_si_falta('bitacora_configuracion', 'COLUMNA', 'idSesionSoporte',
    'ALTER TABLE bitacora_configuracion ADD COLUMN idSesionSoporte INT NULL AFTER idUsuarioAutor');
CALL sp_009_alter_si_falta('bitacora_configuracion', 'FK', 'fk_bc_soporte',
    'ALTER TABLE bitacora_configuracion ADD CONSTRAINT fk_bc_soporte FOREIGN KEY (idEmpresa, idSesionSoporte) REFERENCES soporte_sesiones (idEmpresa, idSesionSoporte)');

CALL sp_009_alter_si_falta('bitacora_empleados', 'COLUMNA', 'idSesionSoporte',
    'ALTER TABLE bitacora_empleados ADD COLUMN idSesionSoporte INT NULL AFTER idUsuarioAutor');
CALL sp_009_alter_si_falta('bitacora_empleados', 'FK', 'fk_be_soporte',
    'ALTER TABLE bitacora_empleados ADD CONSTRAINT fk_be_soporte FOREIGN KEY (idEmpresa, idSesionSoporte) REFERENCES soporte_sesiones (idEmpresa, idSesionSoporte)');

CALL sp_009_alter_si_falta('bitacora_checador', 'COLUMNA', 'idSesionSoporte',
    'ALTER TABLE bitacora_checador ADD COLUMN idSesionSoporte INT NULL AFTER idUsuarioAutor');
CALL sp_009_alter_si_falta('bitacora_checador', 'FK', 'fk_bch_soporte',
    'ALTER TABLE bitacora_checador ADD CONSTRAINT fk_bch_soporte FOREIGN KEY (idEmpresa, idSesionSoporte) REFERENCES soporte_sesiones (idEmpresa, idSesionSoporte)');

-- ── Constantes del sistema (grupo Panel) ─────────────────────────────────────
-- `valor` no se pisa al volver a correr el script: pudo cambiarlo el
-- superadministrador.

INSERT INTO cat_constantes (clave, grupo, orden, etiqueta, ayuda, tipoDato, control, validacion, valor) VALUES
    ('panel.sesion_minutos', 'Panel', 10, 'Duración de la sesión del panel',
     'Minutos que dura la sesión del superadministrador. Es más corta que la de las empresas.',
     'entero', 'input', '{"min":5,"max":240,"unidad":"minutos"}', '30'),
    ('panel.intentos_por_ip', 'Panel', 20, 'Intentos fallidos del panel por IP',
     'Intentos fallidos de entrar al panel desde una misma IP antes de bloquearla unos minutos.',
     'entero', 'input', '{"min":3,"max":100}', '10'),
    ('panel.intentos_por_correo', 'Panel', 30, 'Intentos fallidos del panel por cuenta',
     'Intentos fallidos de entrar al panel con un mismo correo (contraseña o código) antes de bloquearlo unos minutos.',
     'entero', 'input', '{"min":3,"max":50}', '5'),
    ('soporte.sesion_minutos', 'Panel', 40, 'Duración de la sesión de soporte',
     'Minutos que dura una entrada del superadministrador a una empresa.',
     'entero', 'input', '{"min":5,"max":480,"unidad":"minutos"}', '60'),
    ('baja.dias_gracia', 'Panel', 50, 'Días de gracia de la baja',
     'Días que una empresa queda en baja, reversible, antes de eliminar sus datos.',
     'entero', 'input', '{"min":1,"max":365,"unidad":"días"}', '30'),
    ('plan.aviso_porcentaje', 'Panel', 60, 'Aviso de uso del plan',
     'Porcentaje del límite de empleados del plan en el que se avisa a la empresa.',
     'entero', 'input', '{"min":1,"max":99,"unidad":"%"}', '80'),
    ('producto.zona_horaria', 'Panel', 70, 'Zona horaria del producto',
     'Zona con la que se decide el día del conteo de empleados y del cobro.',
     'texto', 'input', NULL, 'America/Mexico_City')
ON DUPLICATE KEY UPDATE grupo = VALUES(grupo), orden = VALUES(orden), etiqueta = VALUES(etiqueta),
    ayuda = VALUES(ayuda), control = VALUES(control), validacion = VALUES(validacion);

-- ── Plan inicial ─────────────────────────────────────────────────────────────
-- Las empresas que ya existen quedan en "Sin límite" (precio 0) desde su
-- fecha de alta, con su renglón ALTA en el historial.

INSERT INTO cat_planes (nombre, tipoCobro, limiteEmpleados, precio)
VALUES ('Sin límite', 'POR_EMPLEADO', NULL, 0)
ON DUPLICATE KEY UPDATE idPlan = idPlan;

INSERT INTO empresas_planes (idEmpresa, idPlan, fechaInicio)
SELECT e.idEmpresa, p.idPlan, DATE(e.fechaAlta)
  FROM empresas e
  JOIN cat_planes p ON p.nombre = 'Sin límite'
 WHERE NOT EXISTS (SELECT 1 FROM empresas_planes x WHERE x.idEmpresa = e.idEmpresa);

INSERT INTO empresas_historial (idEmpresa, tipo, detalle, fecha)
SELECT e.idEmpresa, 'ALTA', 'Alta anterior al panel del superadministrador (009); plan Sin límite', e.fechaAlta
  FROM empresas e
 WHERE NOT EXISTS (SELECT 1 FROM empresas_historial h WHERE h.idEmpresa = e.idEmpresa AND h.tipo = 'ALTA');

DROP PROCEDURE IF EXISTS sp_009_alter_si_falta;

-- =============================================================================
-- ROLLBACK (solo en pruebas; borra todo lo del 009, bitácora del producto
-- incluida)
-- =============================================================================
-- ALTER TABLE bitacora_checador      DROP FOREIGN KEY fk_bch_soporte, DROP INDEX fk_bch_soporte, DROP COLUMN idSesionSoporte;
-- ALTER TABLE bitacora_empleados     DROP FOREIGN KEY fk_be_soporte,  DROP INDEX fk_be_soporte,  DROP COLUMN idSesionSoporte;
-- ALTER TABLE bitacora_configuracion DROP FOREIGN KEY fk_bc_soporte,  DROP INDEX fk_bc_soporte,  DROP COLUMN idSesionSoporte;
-- ALTER TABLE bitacora_permisos      DROP FOREIGN KEY fk_bp_soporte,  DROP INDEX fk_bp_soporte,  DROP COLUMN idSesionSoporte;
-- DROP TABLE IF EXISTS soporte_sesiones;
-- DROP TABLE IF EXISTS empresas_exportaciones;
-- DROP TABLE IF EXISTS empresas_conteo_diario;
-- DROP TABLE IF EXISTS empresas_historial;
-- DROP TABLE IF EXISTS empresas_planes;
-- UPDATE empresas SET estado = 'SUSPENDIDA' WHERE estado IN ('EN_BAJA','ELIMINADA');
-- ALTER TABLE empresas DROP COLUMN fechaEliminacion, DROP COLUMN fechaBajaProgramada,
--     DROP COLUMN fechaEstado, DROP COLUMN motivoEstado,
--     MODIFY COLUMN estado ENUM('ACTIVA','SUSPENDIDA') NOT NULL DEFAULT 'ACTIVA';
-- DELETE FROM constantes_valores WHERE clave IN ('panel.sesion_minutos','panel.intentos_por_ip',
--     'panel.intentos_por_correo','soporte.sesion_minutos','baja.dias_gracia','plan.aviso_porcentaje','producto.zona_horaria');
-- DELETE FROM cat_constantes WHERE clave IN ('panel.sesion_minutos','panel.intentos_por_ip',
--     'panel.intentos_por_correo','soporte.sesion_minutos','baja.dias_gracia','plan.aviso_porcentaje','producto.zona_horaria');
-- (antes, el rollback de 009b_bitacora_producto_inmutable.sql)
-- DROP TABLE IF EXISTS bitacora_producto;
-- DROP TABLE IF EXISTS cat_planes;
-- DROP TABLE IF EXISTS superadmins;
