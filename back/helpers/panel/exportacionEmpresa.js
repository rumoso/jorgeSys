// =============================================================================
// Exportación completa de una empresa (análisis 009 §4, T28)
// =============================================================================
// Un libro de Excel con una hoja "Resumen" y una hoja por tabla de la empresa
// (helpers/panel/tablasBaja.js → SE_EXPORTAN), para entregárselo al cliente al
// dar de baja. Se escribe en flujo (ExcelJS WorkbookWriter) y por lotes, así
// que una tabla grande (marcajes) no se carga entera en memoria.
//
// NO incluye los rostros registrados (empleados_rostros, LP-5) ni las fotos de
// evidencia ni de los empleados (archivos): solo datos.
//
// Se guarda en almacen/empresas/<idEmpresa>/exportaciones/ con nombre
// aleatorio (helpers/archivos.js); quien la genera registra la fila en
// empresas_exportaciones dentro de su transacción (registrarExportacion).
// =============================================================================

const ExcelJS = require('exceljs');
const { db, QueryTypes } = require('../db');
const archivos = require('../archivos');
const { SE_EXPORTAN, NO_SE_EXPORTAN } = require('./tablasBaja');

const LOTE = 2000;
const CARPETA = 'exportaciones';

const celda = (v) => {
    if (v === null || v === undefined) return null;
    if (Buffer.isBuffer(v)) return null;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
};

const consultaDe = (h) => h.select || `SELECT /* panel: exportación de la baja de la empresa */ * FROM ${ h.tabla } WHERE idEmpresa = :idEmpresa`;

/** Renglones de una hoja, por lotes (orden estable). */
async function* renglones(req, h, idEmpresa) {
    for (let desde = 0; ; desde += LOTE) {
        const filas = await db.panel(req).query(`${ consultaDe(h) } ORDER BY ${ h.orden } LIMIT ${ LOTE } OFFSET ${ desde }`,
            { replacements: { idEmpresa } });
        for (const f of filas) yield f;
        if (filas.length < LOTE) return;
    }
}

/**
 * Genera el libro de la empresa y lo guarda. `req` del panel (validarPanel).
 * → { archivo (nombre aleatorio), tamano (bytes), hojas: [{ tabla, filas }] }
 */
const generarExportacion = async (req, idEmpresa, { nombreEmpresa = '' } = {}) => {
    const destino = { idEmpresa };
    const { nombre, ruta } = await archivos.rutaNueva(destino, CARPETA, 'xlsx');
    const hojas = [];
    try {
        for (const h of SE_EXPORTAN) {
            const [r] = await db.panel(req).query(`SELECT /* panel: exportación de la baja de la empresa */ COUNT(*) AS n FROM (${ consultaDe(h) }) x`,
                { replacements: { idEmpresa } });
            hojas.push({ tabla: h.tabla, filas: Number(r.n) });
        }

        const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: ruta, useStyles: false, useSharedStrings: false });
        wb.creator = 'Truck Manager';

        const resumen = wb.addWorksheet('Resumen');
        resumen.addRow(['Exportación completa de la empresa']).commit();
        resumen.addRow(['Empresa', nombreEmpresa]).commit();
        resumen.addRow(['Generada (UTC)', new Date().toISOString()]).commit();
        resumen.addRow([]).commit();
        resumen.addRow(['Hoja', 'Registros']).commit();
        for (const x of hojas) resumen.addRow([x.tabla, x.filas]).commit();
        resumen.addRow([]).commit();
        resumen.addRow(['No incluido', 'Motivo']).commit();
        for (const [t, motivo] of Object.entries(NO_SE_EXPORTAN)) resumen.addRow([t, motivo]).commit();
        resumen.addRow(['Fotos de evidencia y de empleados', 'Archivos de imagen: no se incluyen']).commit();
        resumen.commit();

        for (const h of SE_EXPORTAN) {
            const ws = wb.addWorksheet(h.tabla);
            const omitir = new Set(['idEmpresa', ...(h.omitir || [])]);
            let columnas = null;
            for await (const f of renglones(req, h, idEmpresa)) {
                if (!columnas) {
                    columnas = Object.keys(f).filter(k => !omitir.has(k));
                    ws.addRow(columnas).commit();
                }
                ws.addRow(columnas.map(k => celda(f[k]))).commit();
            }
            if (!columnas) ws.addRow(['(sin registros)']).commit();
            ws.commit();
        }
        await wb.commit();
        const tamano = await archivos.tamano(destino, CARPETA, nombre);
        return { archivo: nombre, tamano: tamano || 0, hojas };
    } catch (error) {
        await archivos.borrar(destino, CARPETA, nombre);
        throw error;
    }
};

/** La fila de empresas_exportaciones (dentro de la transacción de quien la genera). → idExportacion */
const registrarExportacion = async (req, idEmpresa, { archivo, tamano }, transaction) => {
    const [id] = await db.panel(req).query(`
        INSERT INTO empresas_exportaciones (idEmpresa, archivo, tamano, idSuperadmin)
        VALUES (:idEmpresa, :archivo, :tamano, :idSuperadmin) /* panel: exportación de la baja de la empresa */`,
    { replacements: { idEmpresa, archivo, tamano, idSuperadmin: req.idSuperadmin }, type: QueryTypes.INSERT, transaction });
    return id;
};

/** Borra el archivo (si la baja no se guardó). */
const borrarArchivo = (idEmpresa, archivo) => archivos.borrar({ idEmpresa }, CARPETA, archivo);

/** Ruta absoluta del archivo de una exportación, o null si ya no existe. */
const rutaArchivo = async (idEmpresa, archivo) => {
    const destino = { idEmpresa };
    return (await archivos.tamano(destino, CARPETA, archivo)) === null ? null : archivos.rutaDe(destino, CARPETA, archivo);
};

module.exports = { generarExportacion, registrarExportacion, borrarArchivo, rutaArchivo, CARPETA };
