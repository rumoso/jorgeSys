#!/usr/bin/env node
// =============================================================================
// Exporta los intentos y marcajes del dispositivo checador para medir el
// Face ID (análisis 005 §8; protocolo en RHPlan/docs/PRUEBA-FACE-ID.md).
//
//     npm run faceid:exportar -- --empresa 12 [--desde 2026-11-20] [--hasta 2026-11-21] [--salida prueba.csv]
//
// Un renglón por intento (no reconocido, sin prueba de vida, duda entre dos,
// rechazo) y por marcaje de la forma 'dispositivo', con las distancias del
// mejor y del segundo, el umbral y el margen vigentes, y el resultado. Sin
// descriptores ni fotos. Las fechas son UTC (AAAA-MM-DD).
// =============================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const { QueryTypes } = require('sequelize');
const { dbConnection } = require('../database/config');

const args = (() => {
    const out = {};
    const v = process.argv.slice(2);
    for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) out[v[i].slice(2)] = v[i + 1] && !v[i + 1].startsWith('--') ? v[++i] : true;
    return out;
})();

const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
const csv = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${ s.replace(/"/g, '""') }"` : s;
};

(async () => {
    const idEmpresa = Number(args.empresa);
    if (!idEmpresa) { console.error('Uso: npm run faceid:exportar -- --empresa <id> [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD] [--salida archivo.csv]'); process.exit(1); }
    const desde = args.desde || '2000-01-01';
    const hasta = args.hasta || '2999-12-31';
    const q = (sql) => dbConnection.query(sql, { replacements: { idEmpresa, desde, hasta: `${ hasta } 23:59:59.999` }, type: QueryTypes.SELECT });
    try {
        const intentos = await q(`
            SELECT 'INTENTO' AS tipo, i.instante, i.idDispositivo, d.nombre AS dispositivo, i.motivo AS resultado, NULL AS idEmpleado,
                   NULL AS numeroEmpleado, i.datos, i.detalle
              FROM marcajes_intentos i LEFT JOIN dispositivos d ON d.idEmpresa = i.idEmpresa AND d.idDispositivo = i.idDispositivo
             WHERE i.idEmpresa = :idEmpresa AND i.forma = 'dispositivo' AND i.instante BETWEEN :desde AND :hasta`);
        const marcajes = await q(`
            SELECT 'MARCAJE' AS tipo, m.instante, m.idDispositivo, d.nombre AS dispositivo,
                   CONCAT(m.resultado, IF(m.decisionRevision IS NULL, '', CONCAT('/', m.decisionRevision))) AS resultado,
                   m.idEmpleado, e.numeroEmpleado, x.dato AS datos, m.motivoDuda AS detalle
              FROM marcajes m
              JOIN empleados e ON e.idEmpresa = m.idEmpresa AND e.idEmpleado = m.idEmpleado
              LEFT JOIN dispositivos d ON d.idEmpresa = m.idEmpresa AND d.idDispositivo = m.idDispositivo
              LEFT JOIN marcajes_evidencias x ON x.idEmpresa = m.idEmpresa AND x.idMarcaje = m.idMarcaje AND x.tipo = 'faceid'
             WHERE m.idEmpresa = :idEmpresa AND m.forma = 'dispositivo' AND m.instante BETWEEN :desde AND :hasta`);
        const filas = [...intentos, ...marcajes].sort((a, b) => String(a.instante).localeCompare(String(b.instante)));
        const encabezado = ['tipo', 'instante_utc', 'dispositivo', 'resultado', 'faceid', 'numero_empleado', 'id_empleado',
            'distancia_mejor', 'id_mejor', 'distancia_segundo', 'id_segundo', 'umbral', 'margen', 'participantes',
            'vida_segundos', 'vida_cuadros', 'detalle'];
        const lineas = [encabezado.join(',')];
        for (const f of filas) {
            const d = parse(f.datos) || {};
            const mejor = d.mejor || (typeof d.distancia === 'number' ? { distancia: d.distancia, idEmpleado: f.idEmpleado } : null);
            lineas.push([
                f.tipo, f.instante, f.dispositivo, f.resultado, d.resultado || '', f.numeroEmpleado, f.idEmpleado,
                mejor?.distancia, mejor?.idEmpleado, d.segundo?.distancia, d.segundo?.idEmpleado, d.umbral, d.margen,
                d.participantes, d.vida?.segundos ?? d.diagnostico?.segundos, d.vida?.cuadros ?? d.diagnostico?.cuadros, f.detalle
            ].map(csv).join(','));
        }
        const salida = args.salida || `faceid-${ idEmpresa }-${ desde }-${ hasta }.csv`;
        fs.writeFileSync(salida, '﻿' + lineas.join('\n'));
        console.log(`✔ ${ filas.length } renglón(es) en ${ path.resolve(salida) }`);
        await dbConnection.close();
    } catch (e) {
        console.error('✘', e.message);
        await dbConnection.close().catch(() => {});
        process.exit(1);
    }
})();
