-- =============================================================================
-- 003b — Configuración de la empresa y constantes del sistema (análisis 003)
--
-- Las dos son "catálogo + valores": un ajuste o una constante nueva es una
-- FILA en su catálogo, cargada por script; la pantalla se dibuja sola.
--
--   Configuración de la empresa: reglas de negocio que cada cliente
--   establece (tolerancia, días de cierre…). Valor general por empresa y,
--   en los ajustes que lo admiten, valor propio por sucursal.
--
--   Constantes del sistema: lo técnico, del producto. Valor global y,
--   cuando hace falta, uno para una empresa. El cliente no las ve.
--
-- Agregar un ajuste: INSERT en cat_configuracion_ajustes + CALL
-- sp_preparar_configuracion(NULL) para que las empresas lo reciban con su
-- valor inicial sin confirmar.
--
-- Idempotente. Rollback comentado al final.
-- =============================================================================

-- ── Globales (del producto) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cat_configuracion_ajustes (
    clave               VARCHAR(80)   NOT NULL,     -- 'asistencia.tolerancia_retardo'
    grupo               VARCHAR(60)   NOT NULL,     -- 'Asistencia'
    orden               INT           NOT NULL DEFAULT 0,
    etiqueta            VARCHAR(120)  NOT NULL,
    ayuda               VARCHAR(500)  NULL,
    tipoDato            ENUM('entero','decimal','texto','booleano','fecha','hora','lista') NOT NULL,
    control             ENUM('input','checkbox','switch','radio','combo') NOT NULL,
    opciones            JSON          NULL,         -- [{"valor":"1","texto":"Lunes"}]
    validacion          JSON          NULL,         -- {"min":0,"max":120,"unidad":"minutos"}
    valorInicial        VARCHAR(2000) NULL,
    bExcepcionSucursal  TINYINT(1)    NOT NULL DEFAULT 0,
    -- El ajuste entra en cálculos ya hechos: al editarlo se avisa que no
    -- recalcula el pasado (LP-3).
    bAdvierteCalculos   TINYINT(1)    NOT NULL DEFAULT 0,
    bActivo             TINYINT(1)    NOT NULL DEFAULT 1,
    PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cat_constantes (
    clave               VARCHAR(80)   NOT NULL,     -- 'sesion.intentos_por_ip'
    grupo               VARCHAR(60)   NOT NULL,
    orden               INT           NOT NULL DEFAULT 0,
    etiqueta            VARCHAR(120)  NOT NULL,
    ayuda               VARCHAR(500)  NULL,
    tipoDato            ENUM('entero','decimal','texto','booleano','fecha','hora','lista') NOT NULL,
    control             ENUM('input','checkbox','switch','radio','combo') NOT NULL,
    opciones            JSON          NULL,
    validacion          JSON          NULL,
    valor               VARCHAR(2000) NULL,         -- valor global
    bActivo             TINYINT(1)    NOT NULL DEFAULT 1,
    fechaModificacion   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── De empresa ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS configuracion_valores (
    idConfiguracionValor INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT           NOT NULL,
    idSucursal          INT           NULL,         -- NULL = valor general de la empresa
    -- MySQL no cuenta dos NULL como repetidos: esta columna hace único
    -- también el valor general.
    idSucursalUnica     INT           AS (IFNULL(idSucursal, 0)) STORED,
    clave               VARCHAR(80)   NOT NULL,
    valor               VARCHAR(2000) NULL,
    bConfirmado         TINYINT(1)    NOT NULL DEFAULT 0,
    idUsuarioModifico   INT           NULL,
    fechaModificacion   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idConfiguracionValor),
    UNIQUE KEY uq_configuracion_valores (idEmpresa, idSucursalUnica, clave),
    KEY ix_configuracion_valores_clave (idEmpresa, clave),
    CONSTRAINT fk_cv_empresa  FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    -- Referencia compuesta: la sucursal es de la MISMA empresa.
    CONSTRAINT fk_cv_sucursal FOREIGN KEY (idEmpresa, idSucursal) REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_cv_ajuste   FOREIGN KEY (clave) REFERENCES cat_configuracion_ajustes (clave),
    CONSTRAINT fk_cv_usuario  FOREIGN KEY (idUsuarioModifico) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS constantes_valores (
    idEmpresa           INT           NOT NULL,
    clave               VARCHAR(80)   NOT NULL,
    valor               VARCHAR(2000) NULL,
    idUsuarioModifico   INT           NULL,
    fechaModificacion   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa, clave),
    CONSTRAINT fk_ctv_empresa   FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_ctv_constante FOREIGN KEY (clave) REFERENCES cat_constantes (clave),
    CONSTRAINT fk_ctv_usuario   FOREIGN KEY (idUsuarioModifico) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bitácora (LP-4). No se edita ni se borra.
-- Tipos: AJUSTE (valor general), CONFIRMACION (valor inicial aceptado tal
-- cual), EXCEPCION (valor propio de una sucursal; despues NULL = se quitó),
-- ZONA (zona horaria de una sucursal), CONSTANTE (valor de una empresa).
-- UBICACION (punto de una sucursal) se agrega en 015_ubicacion_sucursal.sql.
CREATE TABLE IF NOT EXISTS bitacora_configuracion (
    idBitacora          INT           NOT NULL AUTO_INCREMENT,
    idEmpresa           INT           NOT NULL,
    idSucursal          INT           NULL,
    tipo                ENUM('AJUSTE','CONFIRMACION','EXCEPCION','ZONA','CONSTANTE') NOT NULL,
    clave               VARCHAR(80)   NOT NULL,
    antes               VARCHAR(2000) NULL,
    despues             VARCHAR(2000) NULL,
    idUsuarioAutor      INT           NULL,
    fecha               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idBitacora),
    KEY ix_bitacora_configuracion (idEmpresa, fecha),
    CONSTRAINT fk_bc_empresa  FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_bc_sucursal FOREIGN KEY (idEmpresa, idSucursal) REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_bc_usuario  FOREIGN KEY (idUsuarioAutor) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Catálogo de ajustes de la empresa ────────────────────────────────────────
-- Los demás llegan con su análisis.

INSERT INTO cat_configuracion_ajustes
    (clave, grupo, orden, etiqueta, ayuda, tipoDato, control, opciones, validacion,
     valorInicial, bExcepcionSucursal, bAdvierteCalculos) VALUES
    ('asistencia.tolerancia_retardo', 'Asistencia', 10, 'Tolerancia de retardo',
     'Minutos después de la hora de entrada que todavía no cuentan como retardo.',
     'entero', 'input', NULL, '{"min":0,"max":120,"unidad":"minutos"}', '0', 1, 1),
    ('asistencia.dias_cierre', 'Asistencia', 20, 'Días de cierre',
     'Días que tiene RH, al terminar una semana, para corregirla libremente. Después queda cerrada y cambiarla exige un permiso especial.',
     'entero', 'input', NULL, '{"min":0,"max":31,"unidad":"días"}', '3', 0, 0),
    ('asistencia.inicio_semana', 'Asistencia', 30, 'Día en que empieza la semana',
     'Para los cortes semanales de Asistencia y las horas extra.',
     'lista', 'combo',
     '[{"valor":"1","texto":"Lunes"},{"valor":"2","texto":"Martes"},{"valor":"3","texto":"Miércoles"},{"valor":"4","texto":"Jueves"},{"valor":"5","texto":"Viernes"},{"valor":"6","texto":"Sábado"},{"valor":"7","texto":"Domingo"}]',
     NULL, '1', 0, 1)
ON DUPLICATE KEY UPDATE grupo = VALUES(grupo), orden = VALUES(orden), etiqueta = VALUES(etiqueta),
    ayuda = VALUES(ayuda), control = VALUES(control), opciones = VALUES(opciones),
    validacion = VALUES(validacion), valorInicial = VALUES(valorInicial),
    bExcepcionSucursal = VALUES(bExcepcionSucursal), bAdvierteCalculos = VALUES(bAdvierteCalculos);
-- `tipoDato` no se actualiza: el código ya lee la clave con ese tipo.

-- ── Constantes del sistema ───────────────────────────────────────────────────
-- Solo las que ya tienen quién las lea. `valor` no se pisa al volver a
-- correr el script: pudo cambiarlo el superadministrador.

INSERT INTO cat_constantes (clave, grupo, orden, etiqueta, ayuda, tipoDato, control, validacion, valor) VALUES
    ('sesion.intentos_por_ip', 'Sesión', 10, 'Intentos fallidos por IP',
     'Intentos fallidos de entrar desde una misma IP antes de bloquearla unos minutos. Varias personas de una empresa salen por la misma IP.',
     'entero', 'input', '{"min":5,"max":1000}', '50'),
    ('sesion.intentos_por_correo', 'Sesión', 20, 'Intentos fallidos por correo',
     'Intentos fallidos de entrar con un mismo correo antes de bloquearlo unos minutos.',
     'entero', 'input', '{"min":3,"max":100}', '8')
ON DUPLICATE KEY UPDATE grupo = VALUES(grupo), orden = VALUES(orden), etiqueta = VALUES(etiqueta),
    ayuda = VALUES(ayuda), control = VALUES(control), validacion = VALUES(validacion);

-- ── Permiso ──────────────────────────────────────────────────────────────────

INSERT INTO cat_acciones (accion, menu, etiqueta, orden) VALUES
    ('configuracion_Editar', 'configuracion', 'Cambiar la configuración de la empresa y de sus sucursales', 10)
ON DUPLICATE KEY UPDATE menu = VALUES(menu), etiqueta = VALUES(etiqueta), orden = VALUES(orden);

-- Recursos Humanos ve la configuración (sin cambiarla). El Administrador lo
-- tiene todo por ser protegido.
INSERT IGNORE INTO cat_roles_plantilla_menus (plantilla, menu) VALUES ('RH', 'configuracion');

-- Empresas que ya existen: su rol de Recursos Humanos, mientras siga siendo
-- de plantilla, recibe el menú.
INSERT IGNORE INTO roles_menus (idEmpresa, idRol, menu)
SELECT r.idEmpresa, r.idRol, 'configuracion'
  FROM roles r
 WHERE r.plantilla = 'RH';

-- ── Preparar la configuración de una empresa ─────────────────────────────────
-- Da a la empresa el valor general de cada ajuste activo que todavía no
-- tiene, con su valor inicial y SIN confirmar ("valor inicial, revísalo").
-- Lo usan esta migración, el alta de empresa (helpers/empresaAlta.js) y el
-- script de cada ajuste nuevo. Repetible.

DROP PROCEDURE IF EXISTS sp_preparar_configuracion;

DELIMITER $$
CREATE PROCEDURE sp_preparar_configuracion(IN pIdEmpresa INT)
BEGIN
    INSERT IGNORE INTO configuracion_valores (idEmpresa, idSucursal, clave, valor, bConfirmado)
    SELECT e.idEmpresa, NULL, a.clave, a.valorInicial, 0
      FROM empresas e
     CROSS JOIN cat_configuracion_ajustes a
     WHERE a.bActivo = 1
       AND (pIdEmpresa IS NULL OR e.idEmpresa = pIdEmpresa);
END$$
DELIMITER ;

CALL sp_preparar_configuracion(NULL);

-- =============================================================================
-- ROLLBACK (solo en pruebas; borra todo lo del 003b)
-- =============================================================================
-- DROP PROCEDURE IF EXISTS sp_preparar_configuracion;
-- DELETE FROM roles_menus WHERE menu = 'configuracion';
-- DELETE FROM cat_roles_plantilla_menus WHERE menu = 'configuracion';
-- DELETE FROM roles_acciones WHERE accion = 'configuracion_Editar';
-- DELETE FROM usuarios_empresa_acciones WHERE accion = 'configuracion_Editar';
-- DELETE FROM cat_acciones WHERE accion = 'configuracion_Editar';
-- DROP TABLE IF EXISTS bitacora_configuracion;
-- DROP TABLE IF EXISTS constantes_valores;
-- DROP TABLE IF EXISTS configuracion_valores;
-- DROP TABLE IF EXISTS cat_constantes;
-- DROP TABLE IF EXISTS cat_configuracion_ajustes;
