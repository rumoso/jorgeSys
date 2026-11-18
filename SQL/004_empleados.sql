-- =============================================================================
-- 004 — Empleados, puestos y departamentos
--
-- El EMPLEADO es la persona que trabaja y checa; el USUARIO es la cuenta para
-- entrar (ARQUITECTURA §4). Un empleado puede no tener cuenta nunca.
--
-- Todas las tablas nuevas son DE EMPRESA (llevan idEmpresa) y sus
-- referencias son compuestas: el empleado, su sucursal, su puesto, su
-- departamento y su cuenta ligada son de la MISMA empresa.
--
--   puestos, departamentos       catálogos de la empresa (nunca se borran)
--   empleados                    la ficha, con el periodo laboral vigente
--   empleados_periodos           un renglón por cada vez que entró
--   empleados_precios            precio por hora con "a partir de"
--   bitacora_empleados           alta, edición, baja, reingreso, sucursal,
--                                precio e importación (LP-4)
--
-- Idempotente. Rollback comentado al final.
-- =============================================================================

-- ── Catálogos de la empresa ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS puestos (
    idPuesto            INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    bActivo             TINYINT(1)   NOT NULL DEFAULT 1,
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion   DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idPuesto),
    -- La intercalación unicode_ci no distingue mayúsculas; los espacios de
    -- más los quita el Back antes de guardar.
    UNIQUE KEY uq_puestos_nombre (idEmpresa, nombre),
    UNIQUE KEY uq_puestos_empresa (idEmpresa, idPuesto),
    CONSTRAINT fk_puestos_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS departamentos (
    idDepartamento      INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    bActivo             TINYINT(1)   NOT NULL DEFAULT 1,
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion   DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idDepartamento),
    UNIQUE KEY uq_departamentos_nombre (idEmpresa, nombre),
    UNIQUE KEY uq_departamentos_empresa (idEmpresa, idDepartamento),
    CONSTRAINT fk_departamentos_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Empleados ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empleados (
    idEmpleado          INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    -- Texto: hay empresas con numeración propia ('A-0012'). Único también
    -- contra los dados de baja.
    numeroEmpleado      VARCHAR(20)  NOT NULL,
    nombre              VARCHAR(80)  NOT NULL,
    apellidoPaterno     VARCHAR(60)  NOT NULL,
    apellidoMaterno     VARCHAR(60)  NULL,
    -- Principal: donde pertenece (horario y festivos). Operativa: donde
    -- trabaja hoy. Cubrir a alguien no cambia la principal.
    idSucursalPrincipal INT          NOT NULL,
    idSucursalOperativa INT          NOT NULL,
    idPuesto            INT          NULL,
    idDepartamento      INT          NULL,
    -- Periodo vigente, repetido aquí para filtrar y listar sin cruzar. La
    -- verdad histórica está en empleados_periodos.
    estado              ENUM('ACTIVO','BAJA') NOT NULL DEFAULT 'ACTIVO',
    fechaIngreso        DATE         NOT NULL,
    fechaBaja           DATE         NULL,
    motivoBaja          VARCHAR(250) NULL,
    telefono            VARCHAR(20)  NULL,
    correo              VARCHAR(150) NULL,
    -- Datos personales: solo con el permiso empleados_DatosPersonales.
    curp                CHAR(18)     NULL,
    rfc                 VARCHAR(13)  NULL,
    nss                 CHAR(11)     NULL,
    fechaNacimiento     DATE         NULL,
    foto                VARCHAR(80)  NULL,      -- nombre del archivo en almacen/
    idUsuario           INT          NULL,      -- cuenta ligada (opcional)
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fechaModificacion   DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpleado),
    UNIQUE KEY uq_empleados_numero (idEmpresa, numeroEmpleado),
    UNIQUE KEY uq_empleados_empresa (idEmpresa, idEmpleado),
    -- Un usuario, a lo más un empleado por empresa (varios NULL sí se permiten).
    UNIQUE KEY uq_empleados_usuario (idEmpresa, idUsuario),
    KEY ix_empleados_principal (idEmpresa, idSucursalPrincipal),
    KEY ix_empleados_operativa (idEmpresa, idSucursalOperativa),
    KEY ix_empleados_estado (idEmpresa, estado),
    KEY ix_empleados_curp (idEmpresa, curp),
    CONSTRAINT fk_empleados_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_empleados_principal FOREIGN KEY (idEmpresa, idSucursalPrincipal)
        REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_empleados_operativa FOREIGN KEY (idEmpresa, idSucursalOperativa)
        REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_empleados_puesto FOREIGN KEY (idEmpresa, idPuesto)
        REFERENCES puestos (idEmpresa, idPuesto),
    CONSTRAINT fk_empleados_departamento FOREIGN KEY (idEmpresa, idDepartamento)
        REFERENCES departamentos (idEmpresa, idDepartamento),
    CONSTRAINT fk_empleados_usuario FOREIGN KEY (idEmpresa, idUsuario)
        REFERENCES usuarios_empresa (idEmpresa, idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada vez que entró: de aquí salen la antigüedad, las vacaciones (008) y
-- los empleados activos de un día (009). `fechaBaja` es su último día.
CREATE TABLE IF NOT EXISTS empleados_periodos (
    idPeriodo           INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idEmpleado          INT          NOT NULL,
    fechaIngreso        DATE         NOT NULL,
    fechaBaja           DATE         NULL,
    motivoBaja          VARCHAR(250) NULL,
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idPeriodo),
    UNIQUE KEY uq_empleados_periodos (idEmpresa, idEmpleado, fechaIngreso),
    KEY ix_empleados_periodos_fechas (idEmpresa, fechaIngreso, fechaBaja),
    CONSTRAINT fk_ep_empleado FOREIGN KEY (idEmpresa, idEmpleado)
        REFERENCES empleados (idEmpresa, idEmpleado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Precio por hora: el de un día es el de mayor `aPartirDe` que no pase de
-- ese día. Con la misma fecha, se reemplaza.
CREATE TABLE IF NOT EXISTS empleados_precios (
    idPrecio            INT           NOT NULL AUTO_INCREMENT,
    idEmpresa           INT           NOT NULL,
    idEmpleado          INT           NOT NULL,
    precioHora          DECIMAL(10,2) NOT NULL,
    aPartirDe           DATE          NOT NULL,
    idUsuarioCaptura    INT           NULL,
    fechaCaptura        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idPrecio),
    UNIQUE KEY uq_empleados_precios (idEmpresa, idEmpleado, aPartirDe),
    CONSTRAINT fk_epr_empleado FOREIGN KEY (idEmpresa, idEmpleado)
        REFERENCES empleados (idEmpresa, idEmpleado),
    CONSTRAINT fk_epr_usuario FOREIGN KEY (idUsuarioCaptura) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bitácora (LP-4). No se edita ni se borra. `antes` y `despues` guardan solo
-- los campos que cambiaron.
CREATE TABLE IF NOT EXISTS bitacora_empleados (
    idBitacora          BIGINT       NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idEmpleado          INT          NOT NULL,
    tipo                ENUM('ALTA','EDICION','BAJA','REINGRESO','SUCURSAL_PRINCIPAL',
                             'SUCURSAL_OPERATIVA','PRECIO','IMPORTACION') NOT NULL,
    antes               JSON         NULL,
    despues             JSON         NULL,
    idUsuarioAutor      INT          NULL,
    fecha               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idBitacora),
    KEY ix_bitacora_empleados (idEmpresa, idEmpleado, fecha),
    CONSTRAINT fk_be_empleado FOREIGN KEY (idEmpresa, idEmpleado)
        REFERENCES empleados (idEmpresa, idEmpleado),
    CONSTRAINT fk_be_usuario FOREIGN KEY (idUsuarioAutor) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Catálogo: menú, acciones y plantillas ────────────────────────────────────

INSERT INTO cat_menus (menu, modulo, titulo, icono, ruta, orden, bInferior) VALUES
    ('departamentos', 'PERSONAS', 'Departamentos', 'account_tree', '/app/departamentos', 30, 0)
ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), titulo = VALUES(titulo), icono = VALUES(icono),
    ruta = VALUES(ruta), orden = VALUES(orden), bInferior = VALUES(bInferior);

INSERT INTO cat_acciones (accion, menu, etiqueta, orden) VALUES
    ('empleados_CreateUpdate',      'empleados',     'Crear y editar empleados', 10),
    ('empleados_Baja',              'empleados',     'Dar de baja y reingresar empleados', 20),
    ('empleados_Precio',            'empleados',     'Ver y cambiar el precio por hora', 30),
    ('empleados_DatosPersonales',   'empleados',     'Ver y editar CURP, RFC, NSS y fecha de nacimiento', 40),
    ('empleados_Importar',          'empleados',     'Alta masiva de empleados desde Excel', 50),
    ('empleados_BajaRetroactiva',   'empleados',     'Dar de baja con fecha anterior al último marcaje', 60),
    ('puestos_CreateUpdate',        'puestos',       'Crear y editar puestos', 10),
    ('puestos_Disable',             'puestos',       'Activar y desactivar puestos', 20),
    ('departamentos_CreateUpdate',  'departamentos', 'Crear y editar departamentos', 10),
    ('departamentos_Disable',       'departamentos', 'Activar y desactivar departamentos', 20)
ON DUPLICATE KEY UPDATE menu = VALUES(menu), etiqueta = VALUES(etiqueta), orden = VALUES(orden);

-- Recursos Humanos: el menú Departamentos y todas las acciones menos la baja
-- retroactiva. El Encargado conserva solo el menú Empleados (consulta).
INSERT IGNORE INTO cat_roles_plantilla_menus (plantilla, menu) VALUES ('RH', 'departamentos');

INSERT IGNORE INTO cat_roles_plantilla_acciones (plantilla, accion) VALUES
    ('RH', 'empleados_CreateUpdate'), ('RH', 'empleados_Baja'), ('RH', 'empleados_Precio'),
    ('RH', 'empleados_DatosPersonales'), ('RH', 'empleados_Importar'),
    ('RH', 'puestos_CreateUpdate'), ('RH', 'puestos_Disable'),
    ('RH', 'departamentos_CreateUpdate'), ('RH', 'departamentos_Disable');

-- Empresas que ya existen: su rol de Recursos Humanos (el de la plantilla)
-- recibe el menú y las acciones.
INSERT IGNORE INTO roles_menus (idEmpresa, idRol, menu)
SELECT r.idEmpresa, r.idRol, 'departamentos'
  FROM roles r
 WHERE r.plantilla = 'RH';

INSERT IGNORE INTO roles_acciones (idEmpresa, idRol, accion)
SELECT r.idEmpresa, r.idRol, pa.accion
  FROM roles r
  JOIN cat_roles_plantilla_acciones pa ON pa.plantilla = r.plantilla
 WHERE r.plantilla = 'RH'
   AND pa.accion IN ('empleados_CreateUpdate', 'empleados_Baja', 'empleados_Precio',
                     'empleados_DatosPersonales', 'empleados_Importar',
                     'puestos_CreateUpdate', 'puestos_Disable',
                     'departamentos_CreateUpdate', 'departamentos_Disable');

-- ── Constantes del sistema ───────────────────────────────────────────────────
-- `valor` no se pisa al volver a correr el script.

INSERT INTO cat_constantes (clave, grupo, orden, etiqueta, ayuda, tipoDato, control, validacion, valor) VALUES
    ('archivos.foto_max_mb', 'Archivos', 10, 'Tamaño máximo de una foto',
     'Megabytes que puede pesar la foto de un empleado (JPG, PNG o WebP).',
     'entero', 'input', '{"min":1,"max":20,"unidad":"MB"}', '5'),
    ('archivos.excel_max_mb', 'Archivos', 20, 'Tamaño máximo de un Excel',
     'Megabytes que puede pesar el archivo de la alta masiva de empleados.',
     'entero', 'input', '{"min":1,"max":50,"unidad":"MB"}', '5'),
    ('empleados.importacion_max', 'Empleados', 10, 'Renglones por alta masiva',
     'Empleados que admite un archivo de alta masiva.',
     'entero', 'input', '{"min":10,"max":5000}', '1000')
ON DUPLICATE KEY UPDATE grupo = VALUES(grupo), orden = VALUES(orden), etiqueta = VALUES(etiqueta),
    ayuda = VALUES(ayuda), control = VALUES(control), validacion = VALUES(validacion);

-- =============================================================================
-- ROLLBACK (solo en pruebas; borra todo lo del 004)
-- =============================================================================
-- DELETE FROM cat_constantes WHERE clave IN ('archivos.foto_max_mb', 'archivos.excel_max_mb', 'empleados.importacion_max');
-- DELETE FROM constantes_valores WHERE clave IN ('archivos.foto_max_mb', 'archivos.excel_max_mb', 'empleados.importacion_max');
-- DELETE FROM roles_acciones WHERE accion LIKE 'empleados\_%' OR accion LIKE 'puestos\_%' OR accion LIKE 'departamentos\_%';
-- DELETE FROM usuarios_empresa_acciones WHERE accion LIKE 'empleados\_%' OR accion LIKE 'puestos\_%' OR accion LIKE 'departamentos\_%';
-- DELETE FROM cat_roles_plantilla_acciones WHERE accion LIKE 'empleados\_%' OR accion LIKE 'puestos\_%' OR accion LIKE 'departamentos\_%';
-- DELETE FROM cat_acciones WHERE accion LIKE 'empleados\_%' OR accion LIKE 'puestos\_%' OR accion LIKE 'departamentos\_%';
-- DELETE FROM roles_menus WHERE menu = 'departamentos';
-- DELETE FROM usuarios_empresa_menus WHERE menu = 'departamentos';
-- DELETE FROM cat_roles_plantilla_menus WHERE menu = 'departamentos';
-- DELETE FROM cat_menus WHERE menu = 'departamentos';
-- DROP TABLE IF EXISTS bitacora_empleados;
-- DROP TABLE IF EXISTS empleados_precios;
-- DROP TABLE IF EXISTS empleados_periodos;
-- DROP TABLE IF EXISTS empleados;
-- DROP TABLE IF EXISTS departamentos;
-- DROP TABLE IF EXISTS puestos;
