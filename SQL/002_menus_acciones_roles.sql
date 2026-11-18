-- =============================================================================
-- 002 — Menús, acciones y roles por empresa
-- Idempotente. Rollback comentado al final.
--
-- GLOBALES (catálogo del producto): cat_modulos, cat_menus, cat_acciones,
-- cat_roles_plantilla, cat_roles_plantilla_menus, cat_roles_plantilla_acciones.
-- DE EMPRESA (llevan idEmpresa): empresas_modulos, roles, roles_menus,
-- roles_acciones, usuarios_empresa_roles, usuarios_empresa_menus,
-- usuarios_empresa_acciones, bitacora_permisos.
--
-- Usa DELIMITER para el procedimiento: se aplica igual en Workbench que con
-- `node scripts/aplicar-sql.js`.
-- =============================================================================

-- ── Catálogo global ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cat_modulos (
    modulo      VARCHAR(40)  NOT NULL,
    nombre      VARCHAR(80)  NOT NULL,
    icono       VARCHAR(60)  NOT NULL DEFAULT 'apps',
    orden       INT          NOT NULL DEFAULT 0,
    estado      ENUM('DISPONIBLE','PROXIMAMENTE') NOT NULL DEFAULT 'DISPONIBLE',
    -- General (Hoy, Mi cuenta): siempre activo, no se contrata y sus menús
    -- los ve todo usuario, tenga o no rol.
    bSiempre    TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (modulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cat_menus (
    menu        VARCHAR(60)  NOT NULL,          -- clave estable: 'sucursales'
    modulo      VARCHAR(40)  NOT NULL,
    titulo      VARCHAR(80)  NOT NULL,
    icono       VARCHAR(60)  NOT NULL DEFAULT 'circle',
    ruta        VARCHAR(150) NOT NULL,
    orden       INT          NOT NULL DEFAULT 0,
    -- Acceso en la barra inferior del celular (máximo 3).
    bInferior   TINYINT(1)   NOT NULL DEFAULT 0,
    bActivo     TINYINT(1)   NOT NULL DEFAULT 1,
    PRIMARY KEY (menu),
    UNIQUE KEY uq_cat_menus_ruta (ruta),
    CONSTRAINT fk_cat_menus_modulo FOREIGN KEY (modulo) REFERENCES cat_modulos (modulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cat_acciones (
    accion      VARCHAR(80)  NOT NULL,          -- clave técnica: 'sucursales_CreateUpdate'
    menu        VARCHAR(60)  NOT NULL,
    etiqueta    VARCHAR(150) NOT NULL,          -- lo que ve el cliente
    orden       INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (accion),
    CONSTRAINT fk_cat_acciones_menu FOREIGN KEY (menu) REFERENCES cat_menus (menu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cat_roles_plantilla (
    plantilla   VARCHAR(40)  NOT NULL,
    nombre      VARCHAR(80)  NOT NULL,
    descripcion VARCHAR(250) NULL,
    -- Administrador: tiene todo lo contratado, no se edita ni se desactiva.
    bProtegido  TINYINT(1)   NOT NULL DEFAULT 0,
    orden       INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (plantilla)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cat_roles_plantilla_menus (
    plantilla   VARCHAR(40) NOT NULL,
    menu        VARCHAR(60) NOT NULL,
    PRIMARY KEY (plantilla, menu),
    CONSTRAINT fk_crpm_plantilla FOREIGN KEY (plantilla) REFERENCES cat_roles_plantilla (plantilla),
    CONSTRAINT fk_crpm_menu FOREIGN KEY (menu) REFERENCES cat_menus (menu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cat_roles_plantilla_acciones (
    plantilla   VARCHAR(40) NOT NULL,
    accion      VARCHAR(80) NOT NULL,
    PRIMARY KEY (plantilla, accion),
    CONSTRAINT fk_crpa_plantilla FOREIGN KEY (plantilla) REFERENCES cat_roles_plantilla (plantilla),
    CONSTRAINT fk_crpa_accion FOREIGN KEY (accion) REFERENCES cat_acciones (accion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── De empresa ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empresas_modulos (
    idEmpresa   INT         NOT NULL,
    modulo      VARCHAR(40) NOT NULL,
    fechaAlta   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa, modulo),
    CONSTRAINT fk_em_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_em_modulo FOREIGN KEY (modulo) REFERENCES cat_modulos (modulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
    idRol               INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    nombre              VARCHAR(80)  NOT NULL,
    descripcion         VARCHAR(250) NULL,
    bActivo             TINYINT(1)   NOT NULL DEFAULT 1,
    bProtegido          TINYINT(1)   NOT NULL DEFAULT 0,
    plantilla           VARCHAR(40)  NULL,      -- de qué plantilla salió
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion   DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idRol),
    UNIQUE KEY uq_roles_nombre (idEmpresa, nombre),
    UNIQUE KEY uq_roles_empresa (idEmpresa, idRol),
    UNIQUE KEY uq_roles_plantilla (idEmpresa, plantilla),
    CONSTRAINT fk_roles_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_roles_plantilla FOREIGN KEY (plantilla) REFERENCES cat_roles_plantilla (plantilla)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles_menus (
    idEmpresa   INT         NOT NULL,
    idRol       INT         NOT NULL,
    menu        VARCHAR(60) NOT NULL,
    PRIMARY KEY (idEmpresa, idRol, menu),
    CONSTRAINT fk_rm_rol FOREIGN KEY (idEmpresa, idRol) REFERENCES roles (idEmpresa, idRol) ON DELETE CASCADE,
    CONSTRAINT fk_rm_menu FOREIGN KEY (menu) REFERENCES cat_menus (menu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles_acciones (
    idEmpresa   INT         NOT NULL,
    idRol       INT         NOT NULL,
    accion      VARCHAR(80) NOT NULL,
    PRIMARY KEY (idEmpresa, idRol, accion),
    CONSTRAINT fk_ra_rol FOREIGN KEY (idEmpresa, idRol) REFERENCES roles (idEmpresa, idRol) ON DELETE CASCADE,
    CONSTRAINT fk_ra_accion FOREIGN KEY (accion) REFERENCES cat_acciones (accion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios_empresa_roles (
    idEmpresa   INT NOT NULL,
    idUsuario   INT NOT NULL,
    idRol       INT NOT NULL,
    PRIMARY KEY (idEmpresa, idUsuario, idRol),
    KEY ix_uer_rol (idEmpresa, idRol),
    -- El usuario y el rol son de la MISMA empresa.
    CONSTRAINT fk_uer_acceso FOREIGN KEY (idEmpresa, idUsuario)
        REFERENCES usuarios_empresa (idEmpresa, idUsuario) ON DELETE CASCADE,
    CONSTRAINT fk_uer_rol FOREIGN KEY (idEmpresa, idRol) REFERENCES roles (idEmpresa, idRol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios_empresa_menus (
    idEmpresa   INT         NOT NULL,
    idUsuario   INT         NOT NULL,
    menu        VARCHAR(60) NOT NULL,
    PRIMARY KEY (idEmpresa, idUsuario, menu),
    CONSTRAINT fk_uem_acceso FOREIGN KEY (idEmpresa, idUsuario)
        REFERENCES usuarios_empresa (idEmpresa, idUsuario) ON DELETE CASCADE,
    CONSTRAINT fk_uem_menu FOREIGN KEY (menu) REFERENCES cat_menus (menu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios_empresa_acciones (
    idEmpresa   INT         NOT NULL,
    idUsuario   INT         NOT NULL,
    accion      VARCHAR(80) NOT NULL,
    PRIMARY KEY (idEmpresa, idUsuario, accion),
    CONSTRAINT fk_uea_acceso FOREIGN KEY (idEmpresa, idUsuario)
        REFERENCES usuarios_empresa (idEmpresa, idUsuario) ON DELETE CASCADE,
    CONSTRAINT fk_uea_accion FOREIGN KEY (accion) REFERENCES cat_acciones (accion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bitacora_permisos (
    idBitacora      BIGINT       NOT NULL AUTO_INCREMENT,
    idEmpresa       INT          NOT NULL,
    idUsuarioAutor  INT          NULL,          -- nulo: script o migración
    tipo            VARCHAR(40)  NOT NULL,      -- ROL_CREADO, ROL_PERMISOS, USUARIO_ROLES…
    idRol           INT          NULL,
    idUsuario       INT          NULL,          -- usuario afectado
    descripcion     VARCHAR(250) NOT NULL,
    antes           JSON         NULL,
    despues         JSON         NULL,
    fecha           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idBitacora),
    KEY ix_bp_empresa (idEmpresa, fecha),
    CONSTRAINT fk_bp_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Carga del catálogo ───────────────────────────────────────────────────────

INSERT INTO cat_modulos (modulo, nombre, icono, orden, estado, bSiempre) VALUES
    ('GENERAL',   'General',    'home',            0, 'DISPONIBLE',   1),
    ('CHECADOR',  'Checador',   'fingerprint',    10, 'DISPONIBLE',   0),
    ('PERSONAS',  'Personas',   'groups',         20, 'DISPONIBLE',   0),
    ('EMPRESA',   'Empresa',    'business',       30, 'DISPONIBLE',   0),
    ('NOMINA',    'Nómina',     'payments',       90, 'PROXIMAMENTE', 0),
    ('DESEMPENO', 'Desempeño',  'insights',       91, 'PROXIMAMENTE', 0)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), icono = VALUES(icono), orden = VALUES(orden),
    estado = VALUES(estado), bSiempre = VALUES(bSiempre);

INSERT INTO cat_menus (menu, modulo, titulo, icono, ruta, orden, bInferior) VALUES
    ('hoy',           'GENERAL',   'Hoy',              'space_dashboard',      '/app/hoy',                    0, 1),
    ('asistencia',    'CHECADOR',  'Asistencia',       'event_available',      '/app/asistencia',            10, 1),
    ('ausencias',     'CHECADOR',  'Ausencias',        'event_busy',           '/app/ausencias',             20, 0),
    ('horarios',      'CHECADOR',  'Horarios',         'schedule',             '/app/horarios',              30, 0),
    ('dispositivos',  'CHECADOR',  'Dispositivos',     'tablet_android',       '/app/dispositivos',          40, 0),
    ('empleados',     'PERSONAS',  'Empleados',        'groups',               '/app/empleados',             10, 1),
    ('puestos',       'PERSONAS',  'Puestos',          'work_outline',         '/app/puestos',               20, 0),
    ('sucursales',    'EMPRESA',   'Sucursales',       'storefront',           '/app/empresa/sucursales',    10, 0),
    ('usuarios',      'EMPRESA',   'Usuarios',         'manage_accounts',      '/app/empresa/usuarios',      20, 0),
    ('roles',         'EMPRESA',   'Roles y permisos', 'admin_panel_settings', '/app/empresa/roles',         30, 0),
    ('configuracion', 'EMPRESA',   'Configuración',    'settings',             '/app/empresa/configuracion', 40, 0),
    ('nomina',        'NOMINA',    'Nómina',           'payments',             '/app/nomina',                10, 0),
    ('desempeno',     'DESEMPENO', 'Desempeño',        'insights',             '/app/desempeno',             10, 0)
ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), titulo = VALUES(titulo), icono = VALUES(icono),
    ruta = VALUES(ruta), orden = VALUES(orden), bInferior = VALUES(bInferior);

INSERT INTO cat_acciones (accion, menu, etiqueta, orden) VALUES
    ('sucursales_CreateUpdate',      'sucursales', 'Crear y editar sucursales', 10),
    ('sucursales_Disable',           'sucursales', 'Activar y desactivar sucursales', 20),
    ('usuarios_DarAcceso',           'usuarios',   'Dar acceso a usuarios', 10),
    ('usuarios_Editar',              'usuarios',   'Cambiar roles, permisos y sucursales de un usuario', 20),
    ('usuarios_QuitarAcceso',        'usuarios',   'Quitar el acceso a usuarios', 30),
    ('usuarios_RestablecerPassword', 'usuarios',   'Restablecer contraseñas', 40),
    ('roles_CreateUpdate',           'roles',      'Crear y editar roles', 10),
    ('roles_Disable',                'roles',      'Activar y desactivar roles', 20),
    ('roles_Permisos',               'roles',      'Asignar permisos a los roles', 30)
ON DUPLICATE KEY UPDATE menu = VALUES(menu), etiqueta = VALUES(etiqueta), orden = VALUES(orden);

INSERT INTO cat_roles_plantilla (plantilla, nombre, descripcion, bProtegido, orden) VALUES
    ('ADMINISTRADOR', 'Administrador', 'Todo lo que la empresa tiene contratado. No se edita ni se desactiva.', 1, 0),
    ('RH',            'Recursos Humanos', 'Asistencia, ausencias, horarios y empleados de toda la empresa.', 0, 10),
    ('ENCARGADO',     'Encargado de sucursal', 'Asistencia, ausencias, horarios y empleados de sus sucursales.', 0, 20),
    ('EMPLEADO',      'Empleado', 'Solo lo suyo.', 0, 30)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), descripcion = VALUES(descripcion),
    bProtegido = VALUES(bProtegido), orden = VALUES(orden);

INSERT IGNORE INTO cat_roles_plantilla_menus (plantilla, menu) VALUES
    ('RH', 'asistencia'), ('RH', 'ausencias'), ('RH', 'horarios'), ('RH', 'dispositivos'),
    ('RH', 'empleados'), ('RH', 'puestos'), ('RH', 'sucursales'),
    ('ENCARGADO', 'asistencia'), ('ENCARGADO', 'ausencias'), ('ENCARGADO', 'horarios'),
    ('ENCARGADO', 'empleados');
-- Las acciones de las plantillas llegan con los análisis que crean las
-- pantallas de RH y del encargado (004 en adelante).

-- ── Preparar una empresa: módulos y roles de plantilla ───────────────────────
-- Lo usan esta migración (todas las empresas) y el alta de una empresa nueva
-- (helpers/empresaAlta.js). Repetible: no duplica nada.

DROP PROCEDURE IF EXISTS sp_preparar_empresa;

DELIMITER $$
CREATE PROCEDURE sp_preparar_empresa(IN pIdEmpresa INT)
BEGIN
    -- Módulos disponibles (no los "siempre" ni los próximamente).
    INSERT IGNORE INTO empresas_modulos (idEmpresa, modulo)
    SELECT e.idEmpresa, m.modulo
      FROM empresas e
      JOIN cat_modulos m ON m.estado = 'DISPONIBLE' AND m.bSiempre = 0
     WHERE pIdEmpresa IS NULL OR e.idEmpresa = pIdEmpresa;

    -- Roles copiados de las plantillas.
    INSERT IGNORE INTO roles (idEmpresa, nombre, descripcion, bProtegido, plantilla)
    SELECT e.idEmpresa, p.nombre, p.descripcion, p.bProtegido, p.plantilla
      FROM empresas e
     CROSS JOIN cat_roles_plantilla p
     WHERE (pIdEmpresa IS NULL OR e.idEmpresa = pIdEmpresa)
       AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.idEmpresa = e.idEmpresa AND r.plantilla = p.plantilla);

    -- Sus menús y acciones, solo para roles recién copiados (sin permisos).
    INSERT IGNORE INTO roles_menus (idEmpresa, idRol, menu)
    SELECT r.idEmpresa, r.idRol, pm.menu
      FROM roles r
      JOIN cat_roles_plantilla_menus pm ON pm.plantilla = r.plantilla
     WHERE (pIdEmpresa IS NULL OR r.idEmpresa = pIdEmpresa)
       AND NOT EXISTS (SELECT 1 FROM roles_menus x WHERE x.idEmpresa = r.idEmpresa AND x.idRol = r.idRol);

    INSERT IGNORE INTO roles_acciones (idEmpresa, idRol, accion)
    SELECT r.idEmpresa, r.idRol, pa.accion
      FROM roles r
      JOIN cat_roles_plantilla_acciones pa ON pa.plantilla = r.plantilla
     WHERE (pIdEmpresa IS NULL OR r.idEmpresa = pIdEmpresa)
       AND NOT EXISTS (SELECT 1 FROM roles_acciones x WHERE x.idEmpresa = r.idEmpresa AND x.idRol = r.idRol);
END$$
DELIMITER ;

-- ── Migración de lo que ya existe (001) ──────────────────────────────────────

CALL sp_preparar_empresa(NULL);

-- Quien tenía la marca de administrador recibe el rol Administrador. La
-- columna bAdministrador se elimina en 002b, cuando nada la lea.
SET @tiene_marca = (SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios_empresa'
                       AND COLUMN_NAME = 'bAdministrador');
SET @sql_marca = IF(@tiene_marca > 0,
    'INSERT IGNORE INTO usuarios_empresa_roles (idEmpresa, idUsuario, idRol)
     SELECT ue.idEmpresa, ue.idUsuario, r.idRol
       FROM usuarios_empresa ue
       JOIN roles r ON r.idEmpresa = ue.idEmpresa AND r.plantilla = ''ADMINISTRADOR''
      WHERE ue.bAdministrador = 1',
    'SELECT 1');
PREPARE st_marca FROM @sql_marca;
EXECUTE st_marca;
DEALLOCATE PREPARE st_marca;

-- =============================================================================
-- ROLLBACK (solo en pruebas; borra todo lo del 002)
-- =============================================================================
-- DROP PROCEDURE IF EXISTS sp_preparar_empresa;
-- DROP TABLE IF EXISTS bitacora_permisos;
-- DROP TABLE IF EXISTS usuarios_empresa_acciones;
-- DROP TABLE IF EXISTS usuarios_empresa_menus;
-- DROP TABLE IF EXISTS usuarios_empresa_roles;
-- DROP TABLE IF EXISTS roles_acciones;
-- DROP TABLE IF EXISTS roles_menus;
-- DROP TABLE IF EXISTS roles;
-- DROP TABLE IF EXISTS empresas_modulos;
-- DROP TABLE IF EXISTS cat_roles_plantilla_acciones;
-- DROP TABLE IF EXISTS cat_roles_plantilla_menus;
-- DROP TABLE IF EXISTS cat_roles_plantilla;
-- DROP TABLE IF EXISTS cat_acciones;
-- DROP TABLE IF EXISTS cat_menus;
-- DROP TABLE IF EXISTS cat_modulos;
