-- =============================================================================
-- 003a — Preferencias del usuario (parte del análisis 003, adelantada)
-- Por usuario y por empresa: lo que escoge en una empresa no afecta a la otra.
-- Hoy guarda la apariencia (paleta y modo), la vista tabla/tarjetas de cada
-- pantalla y la sucursal escogida en la barra superior.
-- Idempotente. Rollback comentado al final.
-- =============================================================================

CREATE TABLE IF NOT EXISTS usuarios_preferencias (
    idEmpresa           INT          NOT NULL,
    idUsuario           INT          NOT NULL,
    ambito              VARCHAR(60)  NOT NULL,     -- 'apariencia', 'vista', 'sesion'…
    clave               VARCHAR(80)  NOT NULL,     -- 'paleta', 'sucursales_desktop'…
    valor               VARCHAR(2000) NULL,        -- JSON
    fechaModificacion   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idEmpresa, idUsuario, ambito, clave),
    CONSTRAINT fk_up_acceso FOREIGN KEY (idEmpresa, idUsuario)
        REFERENCES usuarios_empresa (idEmpresa, idUsuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DROP TABLE IF EXISTS usuarios_preferencias;
