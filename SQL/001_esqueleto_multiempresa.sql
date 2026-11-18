-- =============================================================================
-- 001 — Esqueleto multiempresa: empresas, sucursales, usuarios y sesión
-- Idempotente. Rollback comentado al final.
--
-- Tablas GLOBALES (del producto): usuarios, cat_zonas_horarias,
-- bitacora_sesiones. Tablas DE EMPRESA (llevan idEmpresa): empresas,
-- sucursales, usuarios_empresa, usuarios_empresa_sucursales. La lista que
-- manda está en back/helpers/tablasEmpresa.js.
-- =============================================================================

-- ── Globales ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cat_zonas_horarias (
    zona        VARCHAR(64)  NOT NULL,
    nombre      VARCHAR(100) NOT NULL,
    orden       INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (zona)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO cat_zonas_horarias (zona, nombre, orden) VALUES
    ('America/Tijuana',     'Tijuana (Pacífico, con horario de verano)', 1),
    ('America/Hermosillo',  'Sonora (Pacífico, sin horario de verano)', 2),
    ('America/Mazatlan',    'Mazatlán, Sinaloa, Nayarit, BCS (Pacífico)', 3),
    ('America/Chihuahua',   'Chihuahua (Centro)', 4),
    ('America/Ciudad_Juarez','Ciudad Juárez (Montaña, con horario de verano)', 5),
    ('America/Mexico_City', 'Ciudad de México (Centro)', 6),
    ('America/Monterrey',   'Monterrey (Centro)', 7),
    ('America/Matamoros',   'Matamoros (Centro, con horario de verano)', 8),
    ('America/Cancun',      'Cancún, Quintana Roo (Sureste)', 9);

CREATE TABLE IF NOT EXISTS usuarios (
    idUsuario           INT          NOT NULL AUTO_INCREMENT,
    correo              VARCHAR(150) NOT NULL,
    passwordHash        VARCHAR(100) NOT NULL,
    nombre              VARCHAR(150) NOT NULL,
    bActivo             TINYINT(1)   NOT NULL DEFAULT 1,
    -- Sube al cambiar la contraseña o desactivar la cuenta: invalida todos
    -- los tokens de la cuenta, en todas sus empresas.
    versionSesion       INT          NOT NULL DEFAULT 1,
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion   DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idUsuario),
    UNIQUE KEY uq_usuarios_correo (correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bitacora_sesiones (
    idBitacora  BIGINT       NOT NULL AUTO_INCREMENT,
    correo      VARCHAR(150) NOT NULL,
    idUsuario   INT          NULL,
    idEmpresa   INT          NULL,       -- nulo si falló antes de escoger empresa
    ip          VARCHAR(64)  NULL,
    resultado   ENUM('OK','FALLO','BLOQUEADO') NOT NULL,
    motivo      VARCHAR(120) NULL,
    fecha       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idBitacora),
    KEY ix_bitacora_correo (correo, fecha),
    KEY ix_bitacora_empresa (idEmpresa, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── De empresa ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empresas (
    idEmpresa       INT          NOT NULL AUTO_INCREMENT,
    nombreComercial VARCHAR(150) NOT NULL,
    razonSocial     VARCHAR(250) NULL,
    rfc             VARCHAR(13)  NULL,
    estado          ENUM('ACTIVA','SUSPENDIDA') NOT NULL DEFAULT 'ACTIVA',
    fechaAlta       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sucursales (
    idSucursal          INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    direccion           VARCHAR(250) NULL,
    zonaHoraria         VARCHAR(64)  NOT NULL DEFAULT 'America/Mexico_City',
    bActivo             TINYINT(1)   NOT NULL DEFAULT 1,
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion   DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idSucursal),
    UNIQUE KEY uq_sucursales_nombre (idEmpresa, nombre),
    -- Para las referencias compuestas: quien apunte a una sucursal apunta
    -- también a su empresa.
    UNIQUE KEY uq_sucursales_empresa (idEmpresa, idSucursal),
    CONSTRAINT fk_sucursales_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_sucursales_zona FOREIGN KEY (zonaHoraria) REFERENCES cat_zonas_horarias (zona)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios_empresa (
    idEmpresa           INT        NOT NULL,
    idUsuario           INT        NOT NULL,
    bActivo             TINYINT(1) NOT NULL DEFAULT 1,
    -- Provisional hasta los roles del análisis 002.
    bAdministrador      TINYINT(1) NOT NULL DEFAULT 0,
    bTodasSucursales    TINYINT(1) NOT NULL DEFAULT 1,
    -- Sube al quitar el acceso o cambiar marca/sucursales: invalida los
    -- tokens de esta cuenta EN ESTA empresa.
    versionSesion       INT        NOT NULL DEFAULT 1,
    fechaAlta           DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion   DATETIME   NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa, idUsuario),
    KEY ix_usuarios_empresa_usuario (idUsuario),
    CONSTRAINT fk_ue_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_ue_usuario FOREIGN KEY (idUsuario) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios_empresa_sucursales (
    idEmpresa   INT NOT NULL,
    idUsuario   INT NOT NULL,
    idSucursal  INT NOT NULL,
    PRIMARY KEY (idEmpresa, idUsuario, idSucursal),
    KEY ix_ues_sucursal (idEmpresa, idSucursal),
    -- Referencias compuestas: la sucursal y el acceso son de la MISMA empresa.
    CONSTRAINT fk_ues_acceso FOREIGN KEY (idEmpresa, idUsuario)
        REFERENCES usuarios_empresa (idEmpresa, idUsuario) ON DELETE CASCADE,
    CONSTRAINT fk_ues_sucursal FOREIGN KEY (idEmpresa, idSucursal)
        REFERENCES sucursales (idEmpresa, idSucursal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- ROLLBACK (solo en pruebas; borra todo lo del 001)
-- =============================================================================
-- DROP TABLE IF EXISTS usuarios_empresa_sucursales;
-- DROP TABLE IF EXISTS usuarios_empresa;
-- DROP TABLE IF EXISTS sucursales;
-- DROP TABLE IF EXISTS empresas;
-- DROP TABLE IF EXISTS bitacora_sesiones;
-- DROP TABLE IF EXISTS usuarios;
-- DROP TABLE IF EXISTS cat_zonas_horarias;
