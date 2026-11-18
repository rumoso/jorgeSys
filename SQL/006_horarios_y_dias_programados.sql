-- =============================================================================
-- 006 — Horarios y días programados
--
-- El HORARIO del empleado es el que manda; el de la sucursal es solo una
-- plantilla. Cada día trabajable tiene su "encabezado" guardado (día
-- programado): horario, horas, tipo de jornada, sucursal y precio por hora de
-- ese día. Los días cambiados a mano nunca los pisa una regeneración (LP-3).
--
-- Todas las tablas nuevas son DE EMPRESA (llevan idEmpresa) y sus
-- referencias son compuestas (LP-1):
--
--   empleados_horario     el horario semanal del empleado (1 = lunes … 7 = domingo)
--   sucursales_horario    la plantilla de la sucursal
--   dias_programados      un renglón por empleado y fecha
--   bitacora_horarios     horario, plantilla, aplicar, día a mano, regreso y
--                         cobertura (LP-4). Solo se inserta.
--
-- Un día de la semana sin renglón está "sin definir": sus días programados
-- quedan SIN_HORARIO.
--
-- Idempotente. Rollback comentado al final.
-- =============================================================================

-- ── Horario semanal del empleado ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empleados_horario (
    idEmpresa           INT          NOT NULL,
    idEmpleado          INT          NOT NULL,
    diaSemana           TINYINT      NOT NULL,              -- 1 = lunes … 7 = domingo
    bDescanso           TINYINT(1)   NOT NULL DEFAULT 0,
    entrada             TIME         NULL,                  -- NULL en descanso
    salida              TIME         NULL,                  -- menor o igual a la entrada = cruza la medianoche
    comidaMinutos       SMALLINT     NOT NULL DEFAULT 0,
    bComidaDentro       TINYINT(1)   NOT NULL DEFAULT 0,    -- 1 = cuenta dentro de la jornada; 0 = se descuenta
    idUsuarioCaptura    INT          NULL,
    fechaCaptura        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa, idEmpleado, diaSemana),
    CONSTRAINT ck_eh_dia CHECK (diaSemana BETWEEN 1 AND 7),
    CONSTRAINT ck_eh_horas CHECK ((bDescanso = 1 AND entrada IS NULL AND salida IS NULL)
                               OR (bDescanso = 0 AND entrada IS NOT NULL AND salida IS NOT NULL)),
    CONSTRAINT fk_eh_empleado FOREIGN KEY (idEmpresa, idEmpleado)
        REFERENCES empleados (idEmpresa, idEmpleado),
    CONSTRAINT fk_eh_usuario FOREIGN KEY (idUsuarioCaptura) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Plantilla de la sucursal ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sucursales_horario (
    idEmpresa           INT          NOT NULL,
    idSucursal          INT          NOT NULL,
    diaSemana           TINYINT      NOT NULL,
    bDescanso           TINYINT(1)   NOT NULL DEFAULT 0,
    entrada             TIME         NULL,
    salida              TIME         NULL,
    comidaMinutos       SMALLINT     NOT NULL DEFAULT 0,
    bComidaDentro       TINYINT(1)   NOT NULL DEFAULT 0,
    idUsuarioCaptura    INT          NULL,
    fechaCaptura        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa, idSucursal, diaSemana),
    CONSTRAINT ck_sh_dia CHECK (diaSemana BETWEEN 1 AND 7),
    CONSTRAINT ck_sh_horas CHECK ((bDescanso = 1 AND entrada IS NULL AND salida IS NULL)
                               OR (bDescanso = 0 AND entrada IS NOT NULL AND salida IS NOT NULL)),
    CONSTRAINT fk_sh_sucursal FOREIGN KEY (idEmpresa, idSucursal)
        REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_sh_usuario FOREIGN KEY (idUsuarioCaptura) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Días programados ─────────────────────────────────────────────────────────
-- Un turno que cruza la medianoche es UN solo día: el de la entrada.
-- `idSucursal` es la sucursal del día (de ahí la tolerancia y los festivos);
-- en una cobertura no cambia: la que cubre va en `idSucursalCobertura`.

CREATE TABLE IF NOT EXISTS dias_programados (
    idDia               BIGINT        NOT NULL AUTO_INCREMENT,
    idEmpresa           INT           NOT NULL,
    idEmpleado          INT           NOT NULL,
    fecha               DATE          NOT NULL,
    estado              ENUM('LABORABLE','DESCANSO','SIN_HORARIO') NOT NULL,
    entrada             TIME          NULL,
    salida              TIME          NULL,
    bCruzaMedianoche    TINYINT(1)    NOT NULL DEFAULT 0,
    comidaMinutos       SMALLINT      NOT NULL DEFAULT 0,
    bComidaDentro       TINYINT(1)    NOT NULL DEFAULT 0,
    horas               DECIMAL(5,2)  NOT NULL DEFAULT 0,
    tipoJornada         ENUM('DIURNA','MIXTA','NOCTURNA') NULL,
    idSucursal          INT           NOT NULL,
    precioHora          DECIMAL(10,2) NULL,
    bManual             TINYINT(1)    NOT NULL DEFAULT 0,
    motivo              VARCHAR(250)  NULL,
    idSucursalCobertura INT           NULL,
    horaCobertura       TIME          NULL,
    horasHorario        DECIMAL(5,2)  NULL,                 -- las que marcaba su horario semanal (cobertura)
    idUsuarioCambio     INT           NULL,
    fechaAlta           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idDia),
    UNIQUE KEY uq_dias_programados (idEmpresa, idEmpleado, fecha),
    KEY ix_dias_programados_sucursal (idEmpresa, idSucursal, fecha),
    KEY ix_dias_programados_cobertura (idEmpresa, idSucursalCobertura, fecha),
    CONSTRAINT ck_dp_cobertura CHECK ((idSucursalCobertura IS NULL AND horaCobertura IS NULL)
                                   OR (idSucursalCobertura IS NOT NULL AND horaCobertura IS NOT NULL)),
    CONSTRAINT fk_dp_empleado FOREIGN KEY (idEmpresa, idEmpleado)
        REFERENCES empleados (idEmpresa, idEmpleado),
    CONSTRAINT fk_dp_sucursal FOREIGN KEY (idEmpresa, idSucursal)
        REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_dp_cobertura FOREIGN KEY (idEmpresa, idSucursalCobertura)
        REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_dp_usuario FOREIGN KEY (idUsuarioCambio) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bitácora (LP-4) ──────────────────────────────────────────────────────────
-- No se edita ni se borra. Del empleado, de la sucursal (plantilla) o de los
-- dos (aplicar la plantilla). `fechaDia` solo en los cambios de un día.

CREATE TABLE IF NOT EXISTS bitacora_horarios (
    idBitacora          BIGINT       NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idEmpleado          INT          NULL,
    idSucursal          INT          NULL,
    fechaDia            DATE         NULL,
    tipo                ENUM('HORARIO','PLANTILLA','APLICAR','DIA','DIA_REGRESO','COBERTURA') NOT NULL,
    motivo              VARCHAR(250) NULL,
    antes               JSON         NULL,
    despues             JSON         NULL,
    idUsuarioAutor      INT          NULL,
    fecha               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idBitacora),
    KEY ix_bitacora_horarios_empleado (idEmpresa, idEmpleado, fecha),
    KEY ix_bitacora_horarios_sucursal (idEmpresa, idSucursal, fecha),
    CONSTRAINT fk_bh_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_bh_empleado FOREIGN KEY (idEmpresa, idEmpleado)
        REFERENCES empleados (idEmpresa, idEmpleado),
    CONSTRAINT fk_bh_sucursal FOREIGN KEY (idEmpresa, idSucursal)
        REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_bh_usuario FOREIGN KEY (idUsuarioAutor) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Constantes del sistema (003) ─────────────────────────────────────────────
-- `valor` no se pisa al volver a correr el script.

INSERT INTO cat_constantes (clave, grupo, orden, etiqueta, ayuda, tipoDato, control, validacion, valor) VALUES
    ('horarios.semanas_adelante', 'Horarios', 10, 'Semanas de días programados',
     'Semanas por adelantado que se generan los días programados de cada empleado.',
     'entero', 'input', '{"min":1,"max":26,"unidad":"semanas"}', '8'),
    ('ley.max_horas_semana', 'Ley', 10, 'Máximo de horas por semana',
     'Máximo legal de horas a la semana del año en curso. Se cambia aquí cuando avance la reforma de las 40 horas.',
     'entero', 'input', '{"min":1,"max":168,"unidad":"horas"}', '48')
ON DUPLICATE KEY UPDATE grupo = VALUES(grupo), orden = VALUES(orden), etiqueta = VALUES(etiqueta),
    ayuda = VALUES(ayuda), control = VALUES(control), validacion = VALUES(validacion);

-- ── Permisos (002): acciones del menú Horarios y plantillas ──────────────────
-- El menú `horarios` ya existe desde el 002.

INSERT INTO cat_acciones (accion, menu, etiqueta, orden) VALUES
    ('horarios_Editar',        'horarios', 'Cambiar el horario de un empleado', 10),
    ('horarios_Plantilla',     'horarios', 'Cambiar la plantilla de una sucursal y aplicarla a empleados', 20),
    ('horarios_CambiarDia',    'horarios', 'Cambiar un día a mano y marcar coberturas', 30),
    ('horarios_Retroactivo',   'horarios', 'Cambiar horarios y días de fechas pasadas', 40),
    ('horarios_SemanaCerrada', 'horarios', 'Cambiar horarios y días de una semana ya cerrada', 50)
ON DUPLICATE KEY UPDATE menu = VALUES(menu), etiqueta = VALUES(etiqueta), orden = VALUES(orden);

-- Administrador: todo (es protegido). Recursos Humanos: todo menos la semana
-- cerrada. Las demás plantillas que ven empleados (Encargado): solo el menú.
INSERT IGNORE INTO cat_roles_plantilla_menus (plantilla, menu) VALUES
    ('RH', 'horarios'), ('ENCARGADO', 'horarios');

INSERT IGNORE INTO cat_roles_plantilla_acciones (plantilla, accion) VALUES
    ('RH', 'horarios_Editar'), ('RH', 'horarios_Plantilla'), ('RH', 'horarios_CambiarDia'),
    ('RH', 'horarios_Retroactivo');

-- Empresas que ya existen: sus roles de plantilla reciben lo nuevo sin duplicar.
INSERT IGNORE INTO roles_menus (idEmpresa, idRol, menu)
SELECT r.idEmpresa, r.idRol, 'horarios'
  FROM roles r
 WHERE r.plantilla IN ('RH', 'ENCARGADO');

INSERT IGNORE INTO roles_acciones (idEmpresa, idRol, accion)
SELECT r.idEmpresa, r.idRol, pa.accion
  FROM roles r
  JOIN cat_roles_plantilla_acciones pa ON pa.plantilla = r.plantilla
 WHERE r.plantilla = 'RH'
   AND pa.accion IN ('horarios_Editar', 'horarios_Plantilla', 'horarios_CambiarDia', 'horarios_Retroactivo');

-- =============================================================================
-- ROLLBACK (solo en pruebas; borra todo lo del 006)
-- =============================================================================
-- DELETE FROM roles_acciones WHERE accion LIKE 'horarios\_%';
-- DELETE FROM usuarios_empresa_acciones WHERE accion LIKE 'horarios\_%';
-- DELETE FROM cat_roles_plantilla_acciones WHERE accion LIKE 'horarios\_%';
-- DELETE FROM cat_acciones WHERE accion LIKE 'horarios\_%';
-- (el menú `horarios` es del 002: no se quita)
-- DELETE FROM constantes_valores WHERE clave IN ('horarios.semanas_adelante', 'ley.max_horas_semana');
-- DELETE FROM cat_constantes WHERE clave IN ('horarios.semanas_adelante', 'ley.max_horas_semana');
-- DROP TABLE IF EXISTS bitacora_horarios;
-- DROP TABLE IF EXISTS dias_programados;
-- DROP TABLE IF EXISTS sucursales_horario;
-- DROP TABLE IF EXISTS empleados_horario;
