-- =============================================================================
-- 005 — El proceso de marcaje y su primera forma: el dispositivo checador
--       con Face ID
--
-- Checar es UN SOLO proceso (LP-6): todas las formas crean marcajes por
-- back/helpers/marcaje.js. Este script deja el catálogo de formas, la
-- política por sucursal y por empleado, los dispositivos, los marcajes con su
-- evidencia, el consentimiento y los rostros.
--
-- GLOBAL (catálogo del producto): cat_formas_checado.
-- DE EMPRESA (llevan idEmpresa y referencias compuestas): formas_sucursal,
-- formas_empleado, dispositivos, marcajes, marcajes_evidencias,
-- marcajes_intentos, consentimientos_texto, empleados_consentimientos,
-- empleados_rostros, bitacora_checador.
--
-- Idempotente. Usa DELIMITER para el procedimiento. Rollback al final.
-- =============================================================================

-- ── Catálogo global de formas de checar ──────────────────────────────────────
-- Cada forma nueva agrega su renglón (y su adaptador en el Back); el proceso
-- y la tabla de marcajes no se tocan.

CREATE TABLE IF NOT EXISTS cat_formas_checado (
    forma           VARCHAR(30)  NOT NULL,          -- clave estable: 'dispositivo'
    nombre          VARCHAR(80)  NOT NULL,
    descripcion     VARCHAR(250) NULL,
    icono           VARCHAR(60)  NOT NULL DEFAULT 'fingerprint',
    estado          ENUM('DISPONIBLE','PROXIMAMENTE') NOT NULL DEFAULT 'PROXIMAMENTE',
    -- Tipos de evidencia que produce: ["foto","faceid","dispositivo"].
    evidencias      JSON         NOT NULL,
    -- Verificaciones que admite, en el orden en que corren: ["antirrebote","faceid"].
    verificaciones  JSON         NOT NULL,
    orden           INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (forma)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO cat_formas_checado (forma, nombre, descripcion, icono, estado, evidencias, verificaciones, orden) VALUES
    ('dispositivo', 'Dispositivo checador', 'Tableta o celular fijo en la sucursal, con Face ID.',
     'tablet_android', 'DISPONIBLE', '["foto","faceid","dispositivo","numero_empleado"]', '["antirrebote","faceid"]', 10),
    ('celular', 'Celular del empleado', 'Su propio celular, con passkey y geocerca (análisis 010).',
     'smartphone', 'PROXIMAMENTE', '[]', '[]', 20),
    ('home_office', 'Home office', 'Desde casa, con las reglas del trabajo a distancia (análisis 010).',
     'home_work', 'PROXIMAMENTE', '[]', '[]', 30),
    ('importacion', 'Importación', 'Marcajes de otro reloj checador, desde un archivo (análisis 011).',
     'upload_file', 'PROXIMAMENTE', '[]', '[]', 40),
    ('whatsapp', 'WhatsApp', 'Checar enviando un mensaje (análisis 011).',
     'chat', 'PROXIMAMENTE', '[]', '[]', 50),
    ('api', 'API', 'Otro sistema registra los marcajes (análisis 011).',
     'api', 'PROXIMAMENTE', '[]', '[]', 60)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), descripcion = VALUES(descripcion), icono = VALUES(icono),
    estado = VALUES(estado), evidencias = VALUES(evidencias), verificaciones = VALUES(verificaciones),
    orden = VALUES(orden);

-- ── Política: qué formas se permiten ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS formas_sucursal (
    idEmpresa           INT          NOT NULL,
    idSucursal          INT          NOT NULL,
    forma               VARCHAR(30)  NOT NULL,
    bActiva             TINYINT(1)   NOT NULL DEFAULT 1,
    configuracion       JSON         NULL,
    idUsuarioModifico   INT          NULL,
    fechaModificacion   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa, idSucursal, forma),
    CONSTRAINT fk_fs_sucursal FOREIGN KEY (idEmpresa, idSucursal) REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_fs_forma FOREIGN KEY (forma) REFERENCES cat_formas_checado (forma),
    CONSTRAINT fk_fs_usuario FOREIGN KEY (idUsuarioModifico) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Excepción por empleado: manda sobre la de su sucursal (permitida o no).
CREATE TABLE IF NOT EXISTS formas_empleado (
    idEmpresa           INT          NOT NULL,
    idEmpleado          INT          NOT NULL,
    forma               VARCHAR(30)  NOT NULL,
    bPermitida          TINYINT(1)   NOT NULL DEFAULT 1,
    configuracion       JSON         NULL,
    idUsuarioModifico   INT          NULL,
    fechaModificacion   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa, idEmpleado, forma),
    CONSTRAINT fk_fe_empleado FOREIGN KEY (idEmpresa, idEmpleado) REFERENCES empleados (idEmpresa, idEmpleado),
    CONSTRAINT fk_fe_forma FOREIGN KEY (forma) REFERENCES cat_formas_checado (forma),
    CONSTRAINT fk_fe_usuario FOREIGN KEY (idUsuarioModifico) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Dispositivos checadores ──────────────────────────────────────────────────
-- El código de vinculación y la llave se guardan como hash (SHA-256). Un
-- dispositivo nunca cambia de sucursal: se revoca y se vincula otro.

CREATE TABLE IF NOT EXISTS dispositivos (
    idDispositivo       INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idSucursal          INT          NOT NULL,
    nombre              VARCHAR(80)  NOT NULL,
    estado              ENUM('PENDIENTE','VINCULADO','REVOCADO') NOT NULL DEFAULT 'PENDIENTE',
    codigoHash          CHAR(64)     NULL,
    codigoVence         DATETIME     NULL,
    llaveHash           CHAR(64)     NULL,
    fechaVinculacion    DATETIME     NULL,
    ultimaConexion      DATETIME     NULL,
    ultimoMarcaje       DATETIME     NULL,
    versionFront        VARCHAR(30)  NULL,
    idUsuarioCreo       INT          NULL,
    idUsuarioRevoco     INT          NULL,
    fechaRevocacion     DATETIME     NULL,
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idDispositivo),
    UNIQUE KEY uq_dispositivos_empresa (idEmpresa, idDispositivo),
    UNIQUE KEY uq_dispositivos_codigo (codigoHash),
    UNIQUE KEY uq_dispositivos_llave (llaveHash),
    KEY ix_dispositivos_sucursal (idEmpresa, idSucursal, estado),
    CONSTRAINT fk_disp_sucursal FOREIGN KEY (idEmpresa, idSucursal) REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_disp_creo FOREIGN KEY (idUsuarioCreo) REFERENCES usuarios (idUsuario),
    CONSTRAINT fk_disp_revoco FOREIGN KEY (idUsuarioRevoco) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Marcajes (LP-2: nunca se borran ni se editan; solo se revisan) ──────────
-- El marcaje crudo: quién, cuándo, dónde y cómo. Sin columnas por forma: lo
-- propio de cada forma va en marcajes_evidencias.

CREATE TABLE IF NOT EXISTS marcajes (
    idMarcaje           BIGINT       NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idSucursal          INT          NOT NULL,
    idEmpleado          INT          NOT NULL,
    instante            DATETIME(3)  NOT NULL,      -- UTC
    fechaNegocio        DATE         NOT NULL,      -- con la zona de la sucursal
    forma               VARCHAR(30)  NOT NULL,
    idDispositivo       INT          NULL,
    idUsuarioRegistro   INT          NULL,          -- quién lo registró, si fue una persona
    resultado           ENUM('ACEPTADO','POR_REVISAR','ANULADO') NOT NULL,
    motivoDuda          VARCHAR(250) NULL,
    -- Revisión (solo de los POR_REVISAR): quién, cuándo, qué decidió y por qué.
    idUsuarioReviso     INT          NULL,
    fechaRevision       DATETIME     NULL,
    decisionRevision    ENUM('APROBADO','RECHAZADO') NULL,
    motivoRevision      VARCHAR(250) NULL,
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idMarcaje),
    UNIQUE KEY uq_marcajes_empresa (idEmpresa, idMarcaje),
    KEY ix_marcajes_empleado (idEmpresa, idEmpleado, instante),
    KEY ix_marcajes_sucursal (idEmpresa, idSucursal, fechaNegocio),
    KEY ix_marcajes_resultado (idEmpresa, resultado),
    CONSTRAINT fk_marc_sucursal FOREIGN KEY (idEmpresa, idSucursal) REFERENCES sucursales (idEmpresa, idSucursal),
    CONSTRAINT fk_marc_empleado FOREIGN KEY (idEmpresa, idEmpleado) REFERENCES empleados (idEmpresa, idEmpleado),
    CONSTRAINT fk_marc_dispositivo FOREIGN KEY (idEmpresa, idDispositivo) REFERENCES dispositivos (idEmpresa, idDispositivo),
    CONSTRAINT fk_marc_forma FOREIGN KEY (forma) REFERENCES cat_formas_checado (forma),
    CONSTRAINT fk_marc_registro FOREIGN KEY (idUsuarioRegistro) REFERENCES usuarios (idUsuario),
    CONSTRAINT fk_marc_reviso FOREIGN KEY (idUsuarioReviso) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Evidencia por tipo: 'foto' (archivo y vencimiento), 'faceid' (parecido),
-- 'dispositivo', 'numero_empleado'… Una forma nueva agrega tipos, no columnas.
-- Al vencer la foto se borra el archivo y `archivo` queda en NULL.
CREATE TABLE IF NOT EXISTS marcajes_evidencias (
    idEvidencia         BIGINT       NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idMarcaje           BIGINT       NOT NULL,
    tipo                VARCHAR(40)  NOT NULL,
    dato                JSON         NULL,
    archivo             VARCHAR(120) NULL,
    vence               DATETIME     NULL,
    fechaAlta           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idEvidencia),
    KEY ix_me_marcaje (idEmpresa, idMarcaje),
    KEY ix_me_vence (vence),
    CONSTRAINT fk_me_marcaje FOREIGN KEY (idEmpresa, idMarcaje) REFERENCES marcajes (idEmpresa, idMarcaje)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bitácora de lo que NO se guardó como marcaje: rechazos, rostros no
-- reconocidos, pruebas de vida fallidas y dudas entre dos (con su folio).
-- Sin llaves foráneas al empleado ni al dispositivo: es bitácora y conserva
-- lo que se supo en ese momento.
CREATE TABLE IF NOT EXISTS marcajes_intentos (
    idIntento           BIGINT       NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idSucursal          INT          NULL,
    idDispositivo       INT          NULL,
    idEmpleado          INT          NULL,
    forma               VARCHAR(30)  NOT NULL,
    motivo              VARCHAR(40)  NOT NULL,      -- FORMA_NO_PERMITIDA, NO_RECONOCIDO, DUDA_ENTRE_DOS…
    detalle             VARCHAR(500) NULL,
    datos               JSON         NULL,          -- distancias y candidatos, para medir (T40)
    folio               CHAR(36)     NULL,          -- duda entre dos: se confirma con el número
    fechaUsoFolio       DATETIME     NULL,
    instante            DATETIME(3)  NOT NULL,      -- UTC
    PRIMARY KEY (idIntento),
    UNIQUE KEY uq_mi_folio (folio),
    KEY ix_mi_empresa (idEmpresa, instante),
    KEY ix_mi_dispositivo (idEmpresa, idDispositivo, instante),
    CONSTRAINT fk_mi_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Consentimiento y rostros (LP-5) ──────────────────────────────────────────

-- Texto de la empresa con versión: cada cambio crea una versión nueva; la
-- vigente es la mayor.
CREATE TABLE IF NOT EXISTS consentimientos_texto (
    idTexto             INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    version             INT          NOT NULL,
    texto               TEXT         NOT NULL,
    idUsuarioCreo       INT          NULL,
    vigenteDesde        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idTexto),
    UNIQUE KEY uq_consentimientos_texto (idEmpresa, version),
    CONSTRAINT fk_ct_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_ct_usuario FOREIGN KEY (idUsuarioCreo) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vigente = sin fecha de retiro. Retirarlo elimina el rostro.
CREATE TABLE IF NOT EXISTS empleados_consentimientos (
    idConsentimiento    INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idEmpleado          INT          NOT NULL,
    version             INT          NOT NULL,
    fechaAceptacion     DATETIME     NOT NULL,
    -- Cómo consta la aceptación: {"medio":"PAPEL_FIRMADO"|"EN_PANTALLA","nota":"…"}
    evidencia           JSON         NOT NULL,
    idUsuarioRegistro   INT          NULL,
    fechaRetiro         DATETIME     NULL,
    motivoRetiro        VARCHAR(250) NULL,
    idUsuarioRetiro     INT          NULL,
    PRIMARY KEY (idConsentimiento),
    KEY ix_ec_empleado (idEmpresa, idEmpleado, fechaRetiro),
    CONSTRAINT fk_ec_empleado FOREIGN KEY (idEmpresa, idEmpleado) REFERENCES empleados (idEmpresa, idEmpleado),
    CONSTRAINT fk_ec_texto FOREIGN KEY (idEmpresa, version) REFERENCES consentimientos_texto (idEmpresa, version),
    CONSTRAINT fk_ec_registro FOREIGN KEY (idUsuarioRegistro) REFERENCES usuarios (idUsuario),
    CONSTRAINT fk_ec_retiro FOREIGN KEY (idUsuarioRetiro) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uno vigente por empleado (el único renglón). Volver a registrar lo
-- reemplaza; retirar el consentimiento lo elimina. Los descriptores nunca
-- salen del servidor.
CREATE TABLE IF NOT EXISTS empleados_rostros (
    idRostro            INT          NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    idEmpleado          INT          NOT NULL,
    descriptores        JSON         NOT NULL,      -- {"promedio":[128], "tomas":[[128],…]}
    tomas               INT          NOT NULL,
    calidad             JSON         NULL,
    idUsuarioRegistro   INT          NULL,
    fechaRegistro       DATETIME     NOT NULL,
    PRIMARY KEY (idRostro),
    UNIQUE KEY uq_empleados_rostros (idEmpresa, idEmpleado),
    CONSTRAINT fk_er_empleado FOREIGN KEY (idEmpresa, idEmpleado) REFERENCES empleados (idEmpresa, idEmpleado),
    CONSTRAINT fk_er_usuario FOREIGN KEY (idUsuarioRegistro) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bitácora del checador (LP-4) ─────────────────────────────────────────────
-- DISPOSITIVO_CREADO, CODIGO_REGENERADO, DISPOSITIVO_ELIMINADO,
-- DISPOSITIVO_VINCULADO, DISPOSITIVO_REVOCADO, FORMA_SUCURSAL, FORMA_EMPLEADO,
-- CONSENTIMIENTO_TEXTO, CONSENTIMIENTO_ACEPTADO, CONSENTIMIENTO_RETIRADO,
-- ROSTRO_REGISTRADO, MARCAJE_APROBADO, MARCAJE_RECHAZADO.
CREATE TABLE IF NOT EXISTS bitacora_checador (
    idBitacora          BIGINT       NOT NULL AUTO_INCREMENT,
    idEmpresa           INT          NOT NULL,
    tipo                VARCHAR(40)  NOT NULL,
    idSucursal          INT          NULL,
    idDispositivo       INT          NULL,
    idEmpleado          INT          NULL,
    idMarcaje           BIGINT       NULL,
    descripcion         VARCHAR(250) NOT NULL,
    antes               JSON         NULL,
    despues             JSON         NULL,
    idUsuarioAutor      INT          NULL,          -- nulo: el propio dispositivo o un script
    fecha               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idBitacora),
    KEY ix_bch_empresa (idEmpresa, fecha),
    KEY ix_bch_empleado (idEmpresa, idEmpleado),
    CONSTRAINT fk_bch_empresa FOREIGN KEY (idEmpresa) REFERENCES empresas (idEmpresa),
    CONSTRAINT fk_bch_usuario FOREIGN KEY (idUsuarioAutor) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Permisos (002): menús, acciones y plantillas ─────────────────────────────

INSERT INTO cat_menus (menu, modulo, titulo, icono, ruta, orden, bInferior) VALUES
    ('formas_checar', 'CHECADOR', 'Formas de checar', 'rule',        '/app/formas-checar', 45, 0),
    ('por_revisar',   'CHECADOR', 'Por revisar',      'fact_check',  '/app/por-revisar',   15, 0)
ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), titulo = VALUES(titulo), icono = VALUES(icono),
    ruta = VALUES(ruta), orden = VALUES(orden), bInferior = VALUES(bInferior);

INSERT INTO cat_acciones (accion, menu, etiqueta, orden) VALUES
    ('formas_Configurar',         'formas_checar', 'Activar y configurar las formas de checar', 10),
    ('consentimiento_Editar',     'formas_checar', 'Editar el texto del consentimiento de Face ID', 20),
    ('dispositivos_CreateUpdate', 'dispositivos',  'Agregar dispositivos checadores y generar su código', 10),
    ('dispositivos_Revocar',      'dispositivos',  'Revocar dispositivos checadores', 20),
    ('rostros_Registrar',         'empleados',     'Registrar el rostro y el consentimiento de Face ID', 70),
    ('marcajes_Revisar',          'por_revisar',   'Aprobar y rechazar marcajes por revisar', 10)
ON DUPLICATE KEY UPDATE menu = VALUES(menu), etiqueta = VALUES(etiqueta), orden = VALUES(orden);

-- Administrador: todo (es protegido). Recursos Humanos: registrar rostros y
-- revisar marcajes. Encargado: revisar marcajes (de sus sucursales). Marcar
-- la acción da también su menú (Por revisar).
INSERT IGNORE INTO cat_roles_plantilla_acciones (plantilla, accion) VALUES
    ('RH', 'rostros_Registrar'), ('RH', 'marcajes_Revisar'), ('ENCARGADO', 'marcajes_Revisar');

-- Empresas que ya existen: sus roles de plantilla reciben lo nuevo sin duplicar.
INSERT IGNORE INTO roles_acciones (idEmpresa, idRol, accion)
SELECT r.idEmpresa, r.idRol, pa.accion
  FROM roles r
  JOIN cat_roles_plantilla_acciones pa ON pa.plantilla = r.plantilla
 WHERE r.plantilla IN ('RH', 'ENCARGADO')
   AND pa.accion IN ('rostros_Registrar', 'marcajes_Revisar');

-- ── Constantes del sistema (003) ─────────────────────────────────────────────
-- `valor` no se pisa al volver a correr el script.

INSERT INTO cat_constantes (clave, grupo, orden, etiqueta, ayuda, tipoDato, control, validacion, valor) VALUES
    ('checador.codigo_vigencia_min', 'Checador', 10, 'Vigencia del código de vinculación',
     'Minutos que dura el código para vincular un dispositivo checador.',
     'entero', 'input', '{"min":2,"max":60,"unidad":"min"}', '10'),
    ('checador.antirrebote_seg', 'Checador', 20, 'Antirrebote',
     'Segundos en los que el mismo empleado no puede volver a checar.',
     'entero', 'input', '{"min":5,"max":900,"unidad":"s"}', '60'),
    ('checador.latido_seg', 'Checador', 30, 'Aviso del dispositivo',
     'Cada cuántos segundos el dispositivo avisa al servidor que está encendido.',
     'entero', 'input', '{"min":30,"max":900,"unidad":"s"}', '120'),
    ('checador.sin_conexion_min', 'Checador', 40, 'Sin conexión después de',
     'Minutos sin aviso para marcar un dispositivo como "sin conexión".',
     'entero', 'input', '{"min":2,"max":240,"unidad":"min"}', '10'),
    ('checador.intentos_por_dispositivo', 'Checador', 50, 'Intentos fallidos por dispositivo',
     'Intentos fallidos (no reconocido, sin prueba de vida) por dispositivo en 5 minutos antes de pausarlo.',
     'entero', 'input', '{"min":5,"max":500}', '40'),
    ('checador.intentos_vinculacion', 'Checador', 60, 'Intentos fallidos de vinculación',
     'Códigos inválidos desde un mismo origen en 15 minutos antes de bloquearlo.',
     'entero', 'input', '{"min":3,"max":100}', '10'),
    ('checador.intentos_antes_de_numero', 'Checador', 70, 'Intentos antes de checar con número',
     'Intentos sin reconocer seguidos antes de ofrecer checar con el número de empleado.',
     'entero', 'input', '{"min":1,"max":10}', '3'),
    ('faceid.umbral', 'Face ID', 10, 'Umbral de reconocimiento',
     'Distancia máxima entre rostros para considerarlos la misma persona (menor = más estricto). Se fija con la prueba de grupo real.',
     'decimal', 'input', '{"min":0.3,"max":0.7}', '0.5'),
    ('faceid.margen_duda', 'Face ID', 20, 'Margen de duda',
     'Si los dos más parecidos quedan a menos de esta distancia entre sí, se pide el número de empleado.',
     'decimal', 'input', '{"min":0,"max":0.3}', '0.06'),
    ('faceid.tomas_registro', 'Face ID', 30, 'Tomas al registrar',
     'Tomas del rostro (en distintas posiciones) que exige el registro.',
     'entero', 'input', '{"min":3,"max":12}', '5'),
    ('faceid.calidad_minima', 'Face ID', 40, 'Calidad mínima',
     'Confianza mínima de la detección del rostro (0 a 1) en las tomas del registro.',
     'decimal', 'input', '{"min":0.3,"max":0.99}', '0.6'),
    ('evidencia.dias_foto', 'Evidencia', 10, 'Días que se conserva la foto',
     'Días que se guarda la foto de un marcaje. Después se elimina sola; el marcaje se conserva.',
     'entero', 'input', '{"min":1,"max":730,"unidad":"días"}', '90')
ON DUPLICATE KEY UPDATE grupo = VALUES(grupo), orden = VALUES(orden), etiqueta = VALUES(etiqueta),
    ayuda = VALUES(ayuda), control = VALUES(control), validacion = VALUES(validacion);

-- ── Preparar el checador de una empresa ──────────────────────────────────────
-- La regla, en un solo lugar: toda sucursal arranca con el dispositivo
-- checador permitido y toda empresa con su texto de consentimiento
-- (versión 1). Lo usan esta migración (todas las empresas), el alta de una
-- empresa y el alta de una sucursal (back/helpers/empresaAlta.js).
-- Repetible: una sucursal que ya tiene su renglón (aunque lo hayan apagado)
-- no se toca.

DROP PROCEDURE IF EXISTS sp_preparar_checador;

DELIMITER $$
CREATE PROCEDURE sp_preparar_checador(IN pIdEmpresa INT)
BEGIN
    INSERT IGNORE INTO formas_sucursal (idEmpresa, idSucursal, forma, bActiva)
    SELECT s.idEmpresa, s.idSucursal, 'dispositivo', 1
      FROM sucursales s
     WHERE (pIdEmpresa IS NULL OR s.idEmpresa = pIdEmpresa)
       AND NOT EXISTS (SELECT 1 FROM formas_sucursal f
                        WHERE f.idEmpresa = s.idEmpresa AND f.idSucursal = s.idSucursal AND f.forma = 'dispositivo');

    INSERT IGNORE INTO consentimientos_texto (idEmpresa, version, texto)
    SELECT e.idEmpresa, 1, CONCAT(
        'Autorizo a ', e.nombreComercial, ' a registrar y usar los rasgos de mi rostro (una representación ',
        'numérica, no una fotografía) con el único fin de registrar mi asistencia en el dispositivo checador. ',
        'Sé que mis datos biométricos no se comparten con terceros ni salen de los servidores del sistema, ',
        'que la foto tomada al checar se conserva solo como evidencia por un tiempo limitado y que puedo ',
        'retirar este consentimiento en cualquier momento con Recursos Humanos; al retirarlo, mi rostro ',
        'registrado se elimina y podré registrar mi asistencia por otra forma.')
      FROM empresas e
     WHERE (pIdEmpresa IS NULL OR e.idEmpresa = pIdEmpresa)
       AND NOT EXISTS (SELECT 1 FROM consentimientos_texto c WHERE c.idEmpresa = e.idEmpresa);
END$$
DELIMITER ;

-- ── Migración de lo que ya existe ────────────────────────────────────────────

CALL sp_preparar_checador(NULL);

-- =============================================================================
-- ROLLBACK (solo en pruebas; borra todo lo del 005)
-- =============================================================================
-- DROP PROCEDURE IF EXISTS sp_preparar_checador;
-- DELETE FROM cat_constantes WHERE clave LIKE 'checador.%' OR clave LIKE 'faceid.%' OR clave = 'evidencia.dias_foto';
-- DELETE FROM constantes_valores WHERE clave LIKE 'checador.%' OR clave LIKE 'faceid.%' OR clave = 'evidencia.dias_foto';
-- DELETE FROM roles_acciones WHERE accion IN ('formas_Configurar','consentimiento_Editar','dispositivos_CreateUpdate','dispositivos_Revocar','rostros_Registrar','marcajes_Revisar');
-- DELETE FROM usuarios_empresa_acciones WHERE accion IN ('formas_Configurar','consentimiento_Editar','dispositivos_CreateUpdate','dispositivos_Revocar','rostros_Registrar','marcajes_Revisar');
-- DELETE FROM cat_roles_plantilla_acciones WHERE accion IN ('formas_Configurar','consentimiento_Editar','dispositivos_CreateUpdate','dispositivos_Revocar','rostros_Registrar','marcajes_Revisar');
-- DELETE FROM cat_acciones WHERE accion IN ('formas_Configurar','consentimiento_Editar','dispositivos_CreateUpdate','dispositivos_Revocar','rostros_Registrar','marcajes_Revisar');
-- DELETE FROM roles_menus WHERE menu IN ('formas_checar','por_revisar');
-- DELETE FROM usuarios_empresa_menus WHERE menu IN ('formas_checar','por_revisar');
-- DELETE FROM cat_roles_plantilla_menus WHERE menu IN ('formas_checar','por_revisar');
-- DELETE FROM cat_menus WHERE menu IN ('formas_checar','por_revisar');
-- DROP TABLE IF EXISTS bitacora_checador;
-- DROP TABLE IF EXISTS empleados_rostros;
-- DROP TABLE IF EXISTS empleados_consentimientos;
-- DROP TABLE IF EXISTS consentimientos_texto;
-- DROP TABLE IF EXISTS marcajes_intentos;
-- DROP TABLE IF EXISTS marcajes_evidencias;
-- DROP TABLE IF EXISTS marcajes;
-- DROP TABLE IF EXISTS dispositivos;
-- DROP TABLE IF EXISTS formas_empleado;
-- DROP TABLE IF EXISTS formas_sucursal;
-- DROP TABLE IF EXISTS cat_formas_checado;
