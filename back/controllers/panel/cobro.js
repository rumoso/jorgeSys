// =============================================================================
// Panel → Cobro (análisis 009 §7, T23)
// =============================================================================
// /api/panel/cobro, con validarPanel. Por empresa, en un mes: su plan, sus
// empleados del mes (MÁXIMO de los conteos diarios, helpers/panel/conteo.js)
// y el importe:
//   LIMITE        → precio fijo (el especial de la empresa, si tiene)
//   POR_EMPLEADO  → precio por empleado (o el especial) × empleados del mes
// El plan del mes es el último que empezó a más tardar el último día del mes.
// =============================================================================

const ExcelJS = require('exceljs');
const { db } = require('../../helpers/db');
const { Regla } = require('../../helpers/permisosEdicion');
const { hoyProducto } = require('../../helpers/empresaAlta');
const { limitesMes, RE_MES } = require('../../helpers/panel/conteo');

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    if (error instanceof Regla) return no(res, error.message, error.data);
    console.error(`panel/${ donde }`, error);
    return res.json({ status_code: 2, message, data: null });
};

const centavos = (n) => Math.round(n * 100) / 100;

/** Mes del query (AAAA-MM) o el mes de hoy del producto. */
const mesDe = async (v) => {
    if (v === undefined || v === null || v === '') return (await hoyProducto()).slice(0, 7);
    if (!RE_MES.test(String(v))) throw new Regla('El mes debe ir como AAAA-MM');
    return String(v);
};

/** El reporte: { mes, inicio, fin, total, filas: [...] } */
const cobroDelMes = async (req, mes) => {
    const { inicio, fin } = limitesMes(mes);
    const planes = await db.panel(req).query(`
        SELECT /* panel: reporte de cobro de todas las empresas (planes del mes) */
               ep.idEmpresaPlan, ep.idEmpresa, ep.idPlan, ep.fechaInicio, ep.fechaFin, ep.precioEspecial,
               p.nombre AS plan, p.tipoCobro, p.limiteEmpleados, p.precio,
               e.nombreComercial, e.razonSocial, e.rfc, e.estado
          FROM empresas_planes ep
          JOIN cat_planes p ON p.idPlan = ep.idPlan
          JOIN empresas e ON e.idEmpresa = ep.idEmpresa
         WHERE ep.fechaInicio <= :fin AND (ep.fechaFin IS NULL OR ep.fechaFin >= :inicio)
         ORDER BY ep.idEmpresa, ep.fechaInicio DESC, ep.idEmpresaPlan DESC`, { replacements: { inicio, fin } });
    const conteos = await db.panel(req).query(`
        SELECT /* panel: reporte de cobro de todas las empresas (máximo del mes) */
               idEmpresa, MAX(empleadosActivos) AS maximo, COUNT(*) AS dias
          FROM empresas_conteo_diario
         WHERE fecha BETWEEN :inicio AND :fin
         GROUP BY idEmpresa`, { replacements: { inicio, fin } });
    const porEmpresa = new Map(conteos.map(c => [c.idEmpresa, c]));

    const filas = [];
    const vistas = new Set();
    for (const p of planes) {
        if (vistas.has(p.idEmpresa)) continue;      // ya está el último plan del mes
        vistas.add(p.idEmpresa);
        const c = porEmpresa.get(p.idEmpresa);
        const empleadosMes = Number(c?.maximo || 0);
        const precioEspecial = p.precioEspecial === null ? null : Number(p.precioEspecial);
        const precioAplicado = precioEspecial ?? Number(p.precio);
        const importe = centavos(p.tipoCobro === 'LIMITE' ? precioAplicado : precioAplicado * empleadosMes);
        filas.push({
            idEmpresa: p.idEmpresa, nombreComercial: p.nombreComercial, razonSocial: p.razonSocial, rfc: p.rfc, estado: p.estado,
            idPlan: p.idPlan, plan: p.plan, tipoCobro: p.tipoCobro,
            limiteEmpleados: p.limiteEmpleados === null ? null : Number(p.limiteEmpleados),
            precio: Number(p.precio), precioEspecial, precioAplicado,
            empleadosMes, diasContados: Number(c?.dias || 0), importe
        });
    }
    filas.sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial, 'es'));
    return { mes, inicio, fin, total: centavos(filas.reduce((s, f) => s + f.importe, 0)), filas };
};

/**
 * GET /api/panel/cobro/getCobroMes?mes=AAAA-MM
 * data: { mes, inicio, fin, total, filas: [{ idEmpresa, nombreComercial, razonSocial, rfc, estado, idPlan, plan,
 *         tipoCobro, limiteEmpleados, precio, precioEspecial, precioAplicado, empleadosMes, diasContados, importe }] }
 */
const getCobroMes = async (req, res) => {
    try {
        const r = await cobroDelMes(req, await mesDe(req.query.mes));
        return ok(res, `Cobro de ${ r.mes }: ${ r.filas.length } empresa(s)`, r);
    } catch (error) {
        return falla(res, 'getCobroMes', error, 'No fue posible generar el reporte de cobro');
    }
};

const TIPO = { LIMITE: 'Con límite (precio fijo)', POR_EMPLEADO: 'Por empleado' };
const MONEDA = '#,##0.00';

/** GET /api/panel/cobro/exportarCobroMes?mes=AAAA-MM — binario .xlsx (los errores, JSON). */
const exportarCobroMes = async (req, res) => {
    try {
        const r = await cobroDelMes(req, await mesDe(req.query.mes));
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Truck Manager';
        const hoja = wb.addWorksheet(`Cobro ${ r.mes }`, { views: [{ state: 'frozen', ySplit: 1 }] });
        hoja.columns = [
            { header: 'Empresa', key: 'nombreComercial', width: 30 },
            { header: 'Razón social', key: 'razonSocial', width: 34 },
            { header: 'RFC', key: 'rfc', width: 15 },
            { header: 'Estado', key: 'estado', width: 12 },
            { header: 'Plan', key: 'plan', width: 22 },
            { header: 'Tipo de cobro', key: 'tipo', width: 24 },
            { header: 'Límite', key: 'limiteEmpleados', width: 9 },
            { header: 'Precio del plan', key: 'precio', width: 15, style: { numFmt: MONEDA } },
            { header: 'Precio especial', key: 'precioEspecial', width: 15, style: { numFmt: MONEDA } },
            { header: 'Empleados del mes', key: 'empleadosMes', width: 18 },
            { header: 'Días contados', key: 'diasContados', width: 14 },
            { header: 'Importe', key: 'importe', width: 15, style: { numFmt: MONEDA } }
        ];
        hoja.getRow(1).font = { bold: true };
        for (const f of r.filas) hoja.addRow({ ...f, tipo: TIPO[f.tipoCobro] || f.tipoCobro });
        const total = hoja.addRow({ nombreComercial: 'Total', importe: r.total });
        total.font = { bold: true };

        const buffer = await wb.xlsx.writeBuffer();
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="cobro-${ r.mes }.xlsx"`
        });
        return res.send(Buffer.from(buffer));
    } catch (error) {
        return falla(res, 'exportarCobroMes', error, 'No fue posible exportar el reporte de cobro');
    }
};

module.exports = { getCobroMes, exportarCobroMes, cobroDelMes };
