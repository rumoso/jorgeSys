#!/usr/bin/env node
// =============================================================================
// Pruebas del panel del superadministrador (análisis 009): empresas, planes,
// conteo, límite del plan y cobro (T14 a T23); sesión de soporte, baja con
// exportación y eliminación, constantes y bitácora (T24 a T34); login en dos
// pasos, código repetido y límite de intentos (T11, T47). Las rutas del panel
// sin sesión o con otra sesión: pruebas-fuga.js (T48).
// La eliminación SOLO se prueba con la empresa que crea esta prueba.
//     node scripts/instalar.js --demo      (una vez; trae DEMO_PANEL_CORREO y DEMO_PANEL_TOTP)
//     npm run dev                          (en otra terminal)
//     npm run pruebas:panel
//
// Crea sus propias empresas ("Prueba Panel …"), planes y cuentas, y al final
// borra todo lo que creó (también lo de una corrida que se cayó a la mitad).
// La bitácora del producto no se borra: es inmutable.
// =============================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { API, ID, PASSWORD, llamar, entrar, entrarPanel, correo, sql, ejecutar, marcador } = require('./lib-pruebas');
const { dbConnection } = require('../database/config');
const { TABLAS_EMPRESA } = require('../helpers/tablasEmpresa');
const { ORDEN_BORRADO } = require('../helpers/panel/tablasBaja');
const totp = require('../helpers/panel/totp');
const { hash, generarLlave } = require('../helpers/llaves');
const { fotoJpeg, rostroAleatorio, secuencia } = require('./lib-faceid-pruebas');

const RUN = crypto.randomBytes(3).toString('hex').toUpperCase();
const PREFIJO = 'Prueba Panel';
const CORREO_NUEVO = `panel.nuevo.${ RUN.toLowerCase() }@demo.test`;

if (!process.env.DEMO_PANEL_CORREO || !process.env.DEMO_PANEL_TOTP) {
    console.error('Falta el superadministrador de la demo: corre `node scripts/instalar.js --demo`');
    process.exit(1);
}

// nodemon reinicia el servidor al guardar cualquier archivo: se reintenta la conexión unos segundos.
const pedir = async (url, opciones, intentos = 10) => {
    try {
        return await fetch(url, opciones);
    } catch (e) {
        if (intentos <= 1) throw e;
        await new Promise(r => setTimeout(r, 1000));
        return pedir(url, opciones, intentos - 1);
    }
};

/** Petición al panel: su token va en x-token-panel. `origen`: contadores del límite de intentos propios de la prueba. */
const panel = async (metodo, ruta, { token, body, query = '', origen } = {}) => {
    const r = await pedir(`${ API }/panel${ ruta }${ query }`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'x-token-panel': token } : {}),
            ...(origen ? { 'x-origen-prueba': origen } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const tipo = r.headers.get('content-type') || '';
    if (!/json/.test(tipo)) return { http: r.status, tipo, binario: Buffer.from(await r.arrayBuffer()), disposicion: r.headers.get('content-disposition') };
    return { http: r.status, ...(await r.json().catch(() => ({}))) };
};

/** Petición del dispositivo checador (sin sesión, con su llave). */
const disp = async (metodo, ruta, llave, { datos, foto } = {}) => {
    const headers = { 'x-dispositivo': llave, 'x-origen-prueba': `pruebas-panel-${ RUN }` };
    let cuerpo;
    if (datos !== undefined) {
        cuerpo = new FormData();
        cuerpo.append('datos', JSON.stringify(datos));
        if (foto) cuerpo.append('foto', new Blob([foto], { type: 'image/jpeg' }), 'foto.jpg');
    }
    const r = await pedir(`${ API }/checador${ ruta }`, { method: metodo, headers, body: cuerpo });
    return { http: r.status, ...(await r.json().catch(() => ({}))) };
};

/** Borra una empresa de prueba completa (todas las TABLAS_EMPRESA), sus archivos y sus cuentas de prueba. */
const borrarEmpresas = async (ids) => {
    if (!ids.length) return;
    await dbConnection.transaction(async (t) => {
        const o = { replacements: { ids }, transaction: t };
        await dbConnection.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });
        try {
            for (const tabla of TABLAS_EMPRESA.filter(x => x !== 'empresas')) {
                await dbConnection.query(`DELETE FROM ${ tabla } WHERE idEmpresa IN (:ids)`, o);
            }
            await dbConnection.query('DELETE FROM empresas WHERE idEmpresa IN (:ids)', o);
        } finally {
            await dbConnection.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t });
        }
    });
    for (const id of ids) {
        for (const carpeta of ['empresas', 'evidencias']) {
            fs.rmSync(path.join(__dirname, '..', 'almacen', carpeta, String(id)), { recursive: true, force: true });
        }
    }
};

const limpiar = async () => {
    const ids = (await sql('SELECT idEmpresa FROM empresas WHERE nombreComercial LIKE :p', { p: `${ PREFIJO } %` })).map(x => x.idEmpresa);
    await borrarEmpresas(ids);
    await ejecutar(`DELETE u FROM usuarios u WHERE u.correo LIKE 'panel.nuevo.%@demo.test'
                     AND NOT EXISTS (SELECT 1 FROM usuarios_empresa ue WHERE ue.idUsuario = u.idUsuario)`);
    await ejecutar("DELETE FROM constantes_valores WHERE clave LIKE 'prueba.panel\\_%'");
    await ejecutar("DELETE FROM cat_constantes WHERE clave LIKE 'prueba.panel\\_%'");
    await ejecutar(`DELETE p FROM cat_planes p WHERE p.nombre LIKE :p
                     AND NOT EXISTS (SELECT 1 FROM empresas_planes ep WHERE ep.idPlan = p.idPlan)`, { p: `${ PREFIJO } %` });
    return ids.length;
};

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
// Valor global de plan.aviso_porcentaje antes de la prueba de constantes (se restaura si la prueba se cae).
let avisoOriginal;
const menusDe = (data) => (data || []).flatMap(g => g.items.map(i => i.menu));

(async () => {
    const m = marcador();
    const previas = await limpiar();
    if (previas) console.log(`(se borraron ${ previas } empresa(s) de una corrida anterior)`);
    let r;
    try {
        const [{ bs0 }] = await sql('SELECT COALESCE(MAX(idBitacora), 0) AS bs0 FROM bitacora_sesiones');
        const [{ bp0 }] = await sql('SELECT COALESCE(MAX(idBitacora), 0) AS bp0 FROM bitacora_producto');
        const tp = await entrarPanel();
        const tAdminA = await entrar('admin.a');

        // ══ Login del panel (T11, T47) ══
        // Los fallos van con `x-origen-prueba` (contadores propios de esta corrida):
        // no bloquean la IP ni la cuenta demo para las demás pruebas.
        const SA = process.env.DEMO_PANEL_CORREO;
        const SECRETO = process.env.DEMO_PANEL_TOTP;
        const MSG = 'Correo, contraseña o código incorrectos';
        const origen = (n) => `pruebas-panel-${ RUN }-${ n }`;
        const [saL] = await sql('SELECT idSuperadmin, totpUltimoPaso FROM superadmins WHERE correo = :c', { c: SA });
        const [entrada] = await sql("SELECT COUNT(*) AS n FROM bitacora_producto WHERE idBitacora > :b AND accion = 'ENTRADA' AND idSuperadmin = :id",
            { b: bp0, id: saL.idSuperadmin });
        const [okSes] = await sql("SELECT COUNT(*) AS n FROM bitacora_sesiones WHERE idBitacora > :b AND correo = :c AND resultado = 'OK' AND motivo = 'Panel'",
            { b: bs0, c: SA });
        m.revisar('login en dos pasos: la entrada queda en bitacora_producto (ENTRADA) y en bitacora_sesiones (OK, "Panel")',
            !!tp && Number(entrada.n) >= 1 && Number(okSes.n) >= 1, JSON.stringify({ entrada, okSes }));
        let l = await panel('POST', '/auth/login', { origen: origen('a'), body: { correo: SA, password: PASSWORD } });
        const t2fa = l.data?.token2fa;
        m.revisar('paso 1 (correo y contraseña) → token2fa, no un token del panel', l.status_code === 0 && !!t2fa && !l.data.token, l.message);
        r = await panel('GET', '/auth/getSesion', { token: t2fa });
        m.revisar('→ el token2fa no abre el panel (401)', r.http === 401 && r.data?.codigo === 'SESION_PANEL_INVALIDA', String(r.http));
        l = await panel('POST', '/auth/login', { origen: origen('a'), body: { correo: SA, password: `${ PASSWORD }x` } });
        r = await panel('POST', '/auth/login', { origen: origen('a'), body: { correo: `no.existe.${ RUN.toLowerCase() }@demo.test`, password: PASSWORD } });
        m.revisar('contraseña incorrecta y correo inexistente → el mismo mensaje', l.status_code === 1 && l.message === MSG && r.status_code === 1
            && r.message === MSG && !l.data && !r.data, `${ l.message } · ${ r.message }`);
        const bueno = totp.codigoActual(SECRETO);
        r = await panel('POST', '/auth/verificar2fa', { origen: origen('a'), token: t2fa, body: { codigo: bueno === '123456' ? '654321' : '123456' } });
        m.revisar('código incorrecto → el mismo mensaje', r.status_code === 1 && r.message === MSG && !r.data, r.message);
        r = await panel('POST', '/auth/verificar2fa', { origen: origen('a'), token: t2fa,
            body: { codigo: totp.codigoActual(SECRETO, Number(saL.totpUltimoPaso) * totp.PERIODO_S * 1000) } });
        const [saL2] = await sql('SELECT totpUltimoPaso FROM superadmins WHERE idSuperadmin = :id', { id: saL.idSuperadmin });
        m.revisar('código ya usado → se rechaza con el mismo mensaje', r.status_code === 1 && r.message === MSG && !r.data?.token
            && Number(saL2.totpUltimoPaso) === Number(saL.totpUltimoPaso), r.message);
        const fallos = (await sql("SELECT motivo FROM bitacora_sesiones WHERE idBitacora > :b AND resultado = 'FALLO' AND motivo LIKE 'Panel%'", { b: bs0 }))
            .map(x => x.motivo);
        m.revisar('→ cada intento fallido queda en bitacora_sesiones con motivo "Panel"',
            ['Panel · Credenciales', 'Panel · Código'].every(x => fallos.includes(x)) && fallos.length >= 4, JSON.stringify(fallos));

        // Límite de intentos, con las constantes de T3.
        const lim = Object.fromEntries((await sql("SELECT clave, valor FROM cat_constantes WHERE clave IN ('panel.intentos_por_ip', 'panel.intentos_por_correo')"))
            .map(x => [x.clave, Number(x.valor)]));
        const porIP = lim['panel.intentos_por_ip'], porCorreo = lim['panel.intentos_por_correo'];
        const bloqueado = (x) => x.http === 429 && x.status_code === 1 && x.data?.codigo === 'LIMITE_INTENTOS';
        let antesDelLimite = true;
        for (let i = 1; i <= porIP; i++) {
            r = await panel('POST', '/auth/login', { origen: origen('ip'), body: { correo: `ip.${ i }.${ RUN.toLowerCase() }@demo.test`, password: 'x' } });
            if (r.http !== 200 || r.message !== MSG) antesDelLimite = false;
        }
        r = await panel('POST', '/auth/login', { origen: origen('ip'), body: { correo: SA, password: PASSWORD } });
        m.revisar(`límite por IP: ${ porIP } fallos (correos distintos) y el siguiente → 429, aun con la contraseña buena`, antesDelLimite && bloqueado(r),
            `${ r.http } ${ r.message }`);
        antesDelLimite = true;
        const correoLim = `correo.${ RUN.toLowerCase() }@demo.test`;
        for (let i = 1; i <= porCorreo; i++) {
            r = await panel('POST', '/auth/login', { origen: origen('correo'), body: { correo: correoLim, password: 'x' } });
            if (r.http !== 200) antesDelLimite = false;
        }
        r = await panel('POST', '/auth/login', { origen: origen('correo'), body: { correo: correoLim, password: 'x' } });
        l = await panel('POST', '/auth/login', { origen: origen('correo'), body: { correo: SA, password: PASSWORD } });
        m.revisar(`límite por correo: ${ porCorreo } fallos y el siguiente → 429; otro correo desde el mismo origen sí entra`,
            antesDelLimite && bloqueado(r) && l.status_code === 0, `${ r.http } ${ r.message } · ${ l.message }`);
        antesDelLimite = true;
        const t2fa2 = (await panel('POST', '/auth/login', { origen: origen('cuenta'), body: { correo: SA, password: PASSWORD } })).data?.token2fa;
        for (let i = 1; i <= porCorreo; i++) {
            r = await panel('POST', '/auth/verificar2fa', { origen: origen('cuenta'), token: t2fa2, body: { codigo: bueno === '123456' ? '654321' : '123456' } });
            if (r.http !== 200 || r.message !== MSG) antesDelLimite = false;
        }
        r = await panel('POST', '/auth/verificar2fa', { origen: origen('cuenta'), token: t2fa2, body: { codigo: '000000' } });
        m.revisar(`límite del código por cuenta: ${ porCorreo } códigos malos y el siguiente → 429`, antesDelLimite && bloqueado(r), `${ r.http } ${ r.message }`);
        const [bloq] = await sql("SELECT COUNT(*) AS n FROM bitacora_sesiones WHERE idBitacora > :b AND resultado = 'BLOQUEADO' AND motivo = 'Panel · Límite de intentos fallidos'",
            { b: bs0 });
        m.revisar('→ cada bloqueo queda en bitacora_sesiones', Number(bloq.n) >= 3, String(bloq.n));

        // ── Separación ──
        r = await llamar('GET', '/panel/empresas/getEmpresas', { token: tAdminA });
        m.revisar('una sesión de empresa (Administrador) no abre el panel', r.http === 401 && r.data?.codigo === 'SESION_PANEL_INVALIDA', String(r.http));
        r = await panel('GET', '/empresas/getEmpresas');
        m.revisar('el panel sin token responde 401', r.http === 401, String(r.http));

        // ── Planes (T19) ──
        const nLim = `${ PREFIJO } Límite ${ RUN }`;
        const nEmp = `${ PREFIJO } Por empleado ${ RUN }`;
        const nOtro = `${ PREFIJO } Chico ${ RUN }`;
        r = await panel('POST', '/planes/insertUpdatePlan', { token: tp, body: { nombre: nLim, tipoCobro: 'LIMITE', precio: 500 } });
        m.revisar('plan con límite sin límite de empleados → se rechaza', r.status_code === 1 && /límite de empleados/.test(r.message), r.message);
        r = await panel('POST', '/planes/insertUpdatePlan', { token: tp, body: { nombre: nLim, tipoCobro: 'LIMITE', limiteEmpleados: 5, precio: 500 } });
        m.revisar('alta de plan con límite (5 empleados, 500 fijo)', r.status_code === 0 && r.data?.id, r.message);
        const planLimite = r.data?.id;
        r = await panel('POST', '/planes/insertUpdatePlan', { token: tp, body: { nombre: nLim, tipoCobro: 'POR_EMPLEADO', precio: 1 } });
        m.revisar('nombre de plan repetido → se rechaza', r.status_code === 1 && /Ya existe/.test(r.message), r.message);
        r = await panel('POST', '/planes/insertUpdatePlan', { token: tp, body: { nombre: nEmp, tipoCobro: 'POR_EMPLEADO', precio: 12.5 } });
        m.revisar('alta de plan por empleado', r.status_code === 0, r.message);
        const planEmpleado = r.data?.id;
        r = await panel('POST', '/planes/insertUpdatePlan', { token: tp, body: { nombre: nOtro, tipoCobro: 'LIMITE', limiteEmpleados: 2, precio: 200 } });
        const planChico = r.data?.id;
        r = await panel('POST', '/planes/insertUpdatePlan', { token: tp, body: { idPlan: planEmpleado, nombre: nEmp, tipoCobro: 'POR_EMPLEADO', precio: 10 } });
        m.revisar('editar el precio de un plan', r.status_code === 0 && r.message === 'Plan actualizado', r.message);
        r = await panel('GET', '/planes/getPlanes', { token: tp });
        const pe = r.data?.find(p => p.idPlan === planEmpleado);
        m.revisar('getPlanes trae los planes con su uso', r.status_code === 0 && pe?.precio === 10 && pe.empresas === 0 && pe.limiteEmpleados === null,
            JSON.stringify(pe));
        r = await panel('PUT', '/planes/disablePlan', { token: tp, body: { idPlan: planEmpleado } });
        m.revisar('desactivar un plan sin empresas', r.status_code === 0, r.message);
        r = await panel('GET', '/planes/getPlanes', { token: tp, query: '?soloActivos=1' });
        m.revisar('→ ya no sale entre los activos', r.status_code === 0 && !r.data.some(p => p.idPlan === planEmpleado), r.message);

        // ── Alta en un paso (T15): cuenta nueva ──
        const nombreNueva = `${ PREFIJO } Nueva ${ RUN }`;
        const alta = {
            nombreComercial: nombreNueva, razonSocial: 'Prueba del panel SA de CV', rfc: 'PPA010101AB1',
            sucursal: 'Matriz', zonaHoraria: 'America/Monterrey', correoAdmin: CORREO_NUEVO, nombreAdmin: 'Admin de Prueba Panel',
            modulos: ['CHECADOR', 'PERSONAS', 'EMPRESA'], idPlan: planLimite
        };
        r = await panel('POST', '/empresas/insertEmpresa', { token: tp, body: { ...alta, idPlan: planEmpleado } });
        m.revisar('alta con un plan desactivado → se rechaza', r.status_code === 1 && /desactivado/.test(r.message), r.message);
        r = await panel('POST', '/empresas/insertEmpresa', { token: tp, body: { ...alta, zonaHoraria: 'Marte/Olympus' } });
        m.revisar('alta con zona horaria desconocida → se rechaza (y no queda nada)', r.status_code === 1 && /zona horaria/.test(r.message)
            && !(await sql('SELECT 1 FROM empresas WHERE nombreComercial = :n', { n: nombreNueva })).length, r.message);
        r = await panel('POST', '/empresas/insertEmpresa', { token: tp, body: { ...alta, correoAdmin: `otro.${ CORREO_NUEVO }`, nombreAdmin: '' } });
        m.revisar('cuenta nueva sin nombre → lo pide', r.status_code === 1 && r.data?.requiereNombre === true, r.message);
        r = await panel('POST', '/empresas/insertEmpresa', { token: tp, body: alta });
        const provisional = r.data?.passwordProvisional;
        m.revisar('alta en un paso con cuenta nueva → contraseña provisional una vez',
            r.status_code === 0 && r.data.cuentaCreada === true && typeof provisional === 'string' && provisional.length >= 8, r.message);
        const N = r.data?.id;
        const idSucN = r.data?.idSucursal;
        r = await panel('POST', '/empresas/insertEmpresa', { token: tp, body: alta });
        m.revisar('nombre comercial repetido → se rechaza', r.status_code === 1 && /Ya existe una empresa/.test(r.message), r.message);

        const [usu] = await sql('SELECT passwordHash FROM usuarios WHERE correo = :c', { c: CORREO_NUEVO });
        const [bp] = await sql("SELECT despues FROM bitacora_producto WHERE accion = 'EMPRESA_ALTA' AND idEmpresa = :N", { N });
        m.revisar('la provisional no se guarda en claro ni en la bitácora',
            usu && usu.passwordHash !== provisional && !!bp && !JSON.stringify(bp.despues).includes(provisional));
        const [plN] = await sql('SELECT idPlan FROM empresas_planes WHERE idEmpresa = :N AND vigente = 1', { N });
        const [alN] = await sql("SELECT COUNT(*) AS n FROM empresas_historial WHERE idEmpresa = :N AND tipo = 'ALTA'", { N });
        const modsN = (await sql('SELECT modulo FROM empresas_modulos WHERE idEmpresa = :N ORDER BY modulo', { N })).map(x => x.modulo);
        const [rolN] = await sql(`SELECT COUNT(*) AS n FROM usuarios_empresa_roles uer JOIN roles r ON r.idEmpresa = uer.idEmpresa AND r.idRol = uer.idRol
                                   JOIN usuarios u ON u.idUsuario = uer.idUsuario WHERE uer.idEmpresa = :N AND u.correo = :c AND r.plantilla = 'ADMINISTRADOR'`,
        { N, c: CORREO_NUEVO });
        const [sucN] = await sql('SELECT zonaHoraria FROM sucursales WHERE idEmpresa = :N', { N });
        m.revisar('→ queda con plan, renglón ALTA, módulos, sucursal con su zona y rol Administrador',
            plN?.idPlan === planLimite && Number(alN.n) === 1 && modsN.join() === 'CHECADOR,EMPRESA,PERSONAS'
            && Number(rolN.n) === 1 && sucN?.zonaHoraria === 'America/Monterrey', JSON.stringify({ plN, alN, modsN, rolN, sucN }));

        r = await llamar('POST', '/auth/login', { body: { correo: CORREO_NUEVO, password: provisional } });
        m.revisar('→ el administrador entra con la provisional a su empresa', r.status_code === 0 && r.data.empresa?.idEmpresa === N, r.message);
        let tN = r.data?.token;

        // ── Alta con cuenta existente ──
        const nombreExistente = `${ PREFIJO } Existente ${ RUN }`;
        const [planSin] = await sql("SELECT idPlan FROM cat_planes WHERE nombre = 'Sin límite'");
        r = await panel('POST', '/empresas/insertEmpresa', { token: tp, body: {
            nombreComercial: nombreExistente, sucursal: 'Única', zonaHoraria: 'America/Mexico_City',
            correoAdmin: correo('admin.b'), idPlan: planSin.idPlan } });
        m.revisar('alta con cuenta existente → solo se le da acceso, sin contraseña', r.status_code === 0 && r.data.cuentaCreada === false
            && r.data.passwordProvisional === null, r.message);
        const X = r.data?.id;
        r = await llamar('POST', '/auth/login', { body: { correo: correo('admin.b'), password: PASSWORD } });
        m.revisar('→ la cuenta existente conserva su contraseña y ve las dos empresas',
            r.status_code === 0 && r.data.seleccion && r.data.empresas.some(e => e.idEmpresa === X) && r.data.empresas.some(e => e.idEmpresa === ID.B),
            r.message);
        const modsX = (await sql('SELECT modulo FROM empresas_modulos WHERE idEmpresa = :X', { X })).length;
        m.revisar('→ sin módulos escogidos, quedan todos los disponibles', modsX === 3, String(modsX));

        // ── Lista y ficha (T14) ──
        r = await panel('GET', '/empresas/getEmpresas', { token: tp, query: `?q=${ encodeURIComponent(RUN) }` });
        const filaN = r.data?.find(e => e.idEmpresa === N);
        m.revisar('getEmpresas filtra por texto y trae plan, empleados, usuarios y alta',
            r.status_code === 0 && r.data.length === 2 && filaN?.plan === nLim && filaN.empleadosActivos === 0 && filaN.usuarios === 1
            && filaN.estado === 'ACTIVA' && !!filaN.fechaAlta, JSON.stringify(filaN));
        r = await panel('GET', '/empresas/getEmpresas', { token: tp, query: `?idPlan=${ planLimite }` });
        m.revisar('getEmpresas filtra por plan', r.status_code === 0 && r.data.length === 1 && r.data[0].idEmpresa === N, String(r.data?.length));
        r = await panel('GET', '/empresas/getEmpresas', { token: tp, query: '?estado=SUSPENDIDA' });
        m.revisar('getEmpresas filtra por estado', r.status_code === 0 && r.data.some(e => e.idEmpresa === ID.C) && r.data.every(e => e.estado === 'SUSPENDIDA'));
        r = await panel('GET', '/empresas/getEmpresas', { token: tp, query: `?q=${ encodeURIComponent('Demo A') }` });
        const filaA = r.data?.find(e => e.idEmpresa === ID.A);
        m.revisar('→ Demo A con su plan, empleados activos y último acceso', !!filaA?.plan && filaA.empleadosActivos >= 6 && !!filaA.ultimoAcceso,
            JSON.stringify(filaA));
        r = await panel('GET', '/empresas/getEmpresaById', { token: tp, query: `?idEmpresa=${ N }` });
        m.revisar('getEmpresaById: datos, plan vigente, 12 meses de uso e historial',
            r.status_code === 0 && r.data.empresa.nombreComercial === nombreNueva && r.data.plan?.idPlan === planLimite
            && r.data.uso.length === 12 && r.data.historial.some(h => h.tipo === 'ALTA'), r.message);
        r = await panel('GET', '/empresas/getEmpresaById', { token: tp, query: '?idEmpresa=99999999' });
        m.revisar('empresa inexistente → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);

        // ── Datos (T16) ──
        r = await panel('POST', '/empresas/updateEmpresaDatos', { token: tp, body: { idEmpresa: N, nombreComercial: nombreNueva, rfc: 'MAL' } });
        m.revisar('RFC inválido → se rechaza', r.status_code === 1 && /RFC/.test(r.message), r.message);
        r = await panel('POST', '/empresas/updateEmpresaDatos', { token: tp, body: { idEmpresa: N, nombreComercial: nombreNueva,
            razonSocial: 'Prueba del panel editada SA', rfc: 'ppa010101ab2' } });
        const [datN] = await sql('SELECT razonSocial, rfc FROM empresas WHERE idEmpresa = :N', { N });
        m.revisar('editar razón social y RFC (en mayúsculas)', r.status_code === 0 && datN.razonSocial === 'Prueba del panel editada SA' && datN.rfc === 'PPA010101AB2',
            r.message);
        r = await panel('POST', '/empresas/updateEmpresaDatos', { token: tp, body: { idEmpresa: N, nombreComercial: nombreExistente } });
        m.revisar('→ nombre de otra empresa → se rechaza', r.status_code === 1 && /Ya existe/.test(r.message), r.message);

        // ── Dispositivo checador de la empresa nueva (para suspensión y límite) ──
        const llave = generarLlave();
        const [usuN] = await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: CORREO_NUEVO });
        await ejecutar(`INSERT INTO dispositivos (idEmpresa, idSucursal, nombre, estado, llaveHash, fechaVinculacion, idUsuarioCreo)
                        VALUES (:N, :s, 'Prueba panel', 'VINCULADO', :h, UTC_TIMESTAMP(), :u)`, { N, s: idSucN, h: hash(llave), u: usuN.idUsuario });
        r = await disp('POST', '/latido', llave);
        m.revisar('el dispositivo de la empresa nueva checa (latido)', r.status_code === 0, r.message);

        // ── Suspender y reactivar (T17) ──
        r = await panel('POST', '/empresas/suspenderEmpresa', { token: tp, body: { idEmpresa: N, motivo: '' } });
        m.revisar('suspender sin motivo → se rechaza', r.status_code === 1, r.message);
        r = await panel('POST', '/empresas/suspenderEmpresa', { token: tp, body: { idEmpresa: N, motivo: 'Falta de pago (prueba)' } });
        m.revisar('suspender con motivo', r.status_code === 0, r.message);
        r = await llamar('GET', '/auth/getSesion', { token: tN });
        m.revisar('→ la sesión abierta termina en la siguiente petición', r.http === 401, String(r.http));
        r = await llamar('POST', '/auth/login', { body: { correo: CORREO_NUEVO, password: provisional } });
        m.revisar('→ no entra: la empresa está suspendida', r.status_code === 1 && /suspendida/.test(r.message), r.message);
        r = await disp('POST', '/latido', llave);
        m.revisar('→ su dispositivo deja de checar', r.status_code === 1 && r.data?.codigo === 'EMPRESA_SUSPENDIDA', r.message);
        r = await panel('POST', '/empresas/suspenderEmpresa', { token: tp, body: { idEmpresa: N, motivo: 'Otra vez' } });
        m.revisar('→ suspender una suspendida → se rechaza', r.status_code === 1, r.message);
        r = await panel('POST', '/empresas/reactivarEmpresa', { token: tp, body: { idEmpresa: N, motivo: 'Pagó (prueba)' } });
        m.revisar('reactivar con motivo', r.status_code === 0, r.message);
        r = await llamar('POST', '/auth/login', { body: { correo: CORREO_NUEVO, password: provisional } });
        tN = r.data?.token;
        m.revisar('→ vuelve a entrar', r.status_code === 0 && !!tN, r.message);
        r = await disp('POST', '/latido', llave);
        m.revisar('→ su dispositivo vuelve a checar', r.status_code === 0, r.message);
        const hist = (await sql('SELECT tipo, motivo FROM empresas_historial WHERE idEmpresa = :N ORDER BY idHistorial', { N }));
        m.revisar('→ historial ALTA, SUSPENSION y REACTIVACION con su motivo',
            hist.map(h => h.tipo).join() === 'ALTA,SUSPENSION,REACTIVACION' && hist[1].motivo === 'Falta de pago (prueba)', JSON.stringify(hist));

        // ── Módulos (T18) ──
        r = await panel('GET', '/empresas/getModulosEmpresa', { token: tp, query: `?idEmpresa=${ N }` });
        m.revisar('getModulosEmpresa: contratados y próximamente', r.status_code === 0 && r.data.find(x => x.modulo === 'PERSONAS')?.contratado === true
            && r.data.some(x => !x.disponible) && !r.data.some(x => x.modulo === 'GENERAL'), JSON.stringify(r.data));
        r = await llamar('GET', '/global/getMenu', { token: tN });
        const conEmpleados = menusDe(r.data).includes('empleados');
        const [rmAntes] = await sql('SELECT COUNT(*) AS n FROM roles_menus WHERE idEmpresa = :N', { N });
        r = await panel('POST', '/empresas/setModulosEmpresa', { token: tp, body: { idEmpresa: N, modulos: ['CHECADOR', 'EMPRESA', 'NOMINA'] } });
        m.revisar('un módulo próximamente no se contrata', r.status_code === 1 && /NOMINA/.test(r.message), r.message);
        r = await panel('POST', '/empresas/setModulosEmpresa', { token: tp, body: { idEmpresa: N, modulos: ['CHECADOR', 'EMPRESA'] } });
        m.revisar('quitar Personas', r.status_code === 0 && r.data.modulos.join() === 'CHECADOR,EMPRESA', r.message);
        r = await llamar('GET', '/global/getMenu', { token: tN });
        const [rmDespues] = await sql('SELECT COUNT(*) AS n FROM roles_menus WHERE idEmpresa = :N', { N });
        m.revisar('→ el menú Empleados desaparece en la siguiente petición; roles y permisos se conservan',
            conEmpleados && !menusDe(r.data).includes('empleados') && rmAntes.n === rmDespues.n, JSON.stringify(menusDe(r.data)));
        r = await llamar('GET', '/empleados/getEmpleados', { token: tN });
        m.revisar('→ y su ruta tampoco responde', r.status_code === 1 && r.data?.codigo === 'SIN_PERMISO', r.message);
        r = await panel('POST', '/empresas/setModulosEmpresa', { token: tp, body: { idEmpresa: N, modulos: ['CHECADOR', 'EMPRESA', 'PERSONAS'] } });
        r = await llamar('GET', '/global/getMenu', { token: tN });
        m.revisar('→ al volver a contratarlo, el menú regresa', menusDe(r.data).includes('empleados'));

        // ── Límite del plan (T20, T22): plan de 5 empleados ──
        const altaEmp = (n) => llamar('POST', '/empleados/insertUpdateEmpleado', { token: tN, body: {
            nombre: `Empleado ${ n }`, apellidoPaterno: `Panel ${ RUN }`, idSucursalPrincipal: idSucN, fechaIngreso: '2025-01-01' } });
        const aviso = () => llamar('GET', '/global/getAvisoPlan', { token: tN });
        r = await aviso();
        m.revisar('getAvisoPlan sin empleados → NINGUNO', r.status_code === 0 && r.data.nivel === 'NINGUNO' && r.data.limite === 5 && r.data.activos === 0,
            JSON.stringify(r.data));
        const empleados = [];
        for (let i = 1; i <= 4; i++) { r = await altaEmp(i); empleados.push(r.data?.id); }
        r = await aviso();
        m.revisar('→ 4 de 5 (80 %) → AVISO', r.data?.nivel === 'AVISO' && r.data.porcentaje === 80 && /80 %/.test(r.data.mensaje), JSON.stringify(r.data));
        r = await altaEmp(5);
        empleados.push(r.data?.id);
        m.revisar('→ el 5.º sí entra', r.status_code === 0, r.message);
        r = await aviso();
        m.revisar('→ 5 de 5 → LIMITE', r.data?.nivel === 'LIMITE' && r.data.porcentaje === 100, JSON.stringify(r.data));
        r = await altaEmp(6);
        m.revisar('→ el 6.º se rechaza con LIMITE_PLAN y dice cómo subir de plan',
            r.status_code === 1 && r.data?.codigo === 'LIMITE_PLAN' && /subir|suba/.test(r.message), r.message);
        r = await llamar('POST', '/empleados/importarEmpleados', { token: tN, body: { renglones: [
            { renglon: 2, datos: { nombre: 'Importado', apellidoPaterno: `Panel ${ RUN }`, sucursal: 'Matriz', fechaIngreso: '2025-01-01' } }] } });
        m.revisar('→ la alta masiva también se rechaza con LIMITE_PLAN', r.status_code === 1 && r.data?.codigo === 'LIMITE_PLAN', r.message);
        r = await llamar('POST', '/empleados/bajaEmpleado', { token: tN, body: { idEmpleado: empleados[0], fechaBaja: '2025-06-15', motivoBaja: 'Prueba' } });
        m.revisar('→ dar de baja sí se puede en el límite', r.status_code === 0, r.message);
        r = await altaEmp(7);
        m.revisar('→ con un lugar libre, la alta entra', r.status_code === 0, r.message);
        r = await llamar('POST', '/empleados/reingresoEmpleado', { token: tN, body: { idEmpleado: empleados[0], fechaIngreso: '2025-09-01' } });
        m.revisar('→ la reactivación (reingreso) en el límite se rechaza con LIMITE_PLAN', r.status_code === 1 && r.data?.codigo === 'LIMITE_PLAN', r.message);
        r = await disp('GET', '/getReto', llave);
        m.revisar('→ el checador no revisa el plan (reto)', r.status_code === 0, r.message);
        // Una cara desconocida (los fallos que pide checar con número) y luego con su número: queda por revisar.
        const extrano = rostroAleatorio();
        for (let i = 0; i < 3; i++) {
            const reto = await disp('GET', '/getReto', llave);
            await disp('POST', '/checar', llave, { datos: { idReto: reto.data?.idReto, frames: secuencia(extrano, reto.data?.pasos || []) }, foto: fotoJpeg() });
        }
        r = await disp('POST', '/checarConNumero', llave, { datos: { numeroEmpleado: '2', folio: null }, foto: fotoJpeg() });
        const [marc] = await sql('SELECT COUNT(*) AS n FROM marcajes WHERE idEmpresa = :N', { N });
        m.revisar('→ y en el límite se sigue checando (queda el marcaje)', r.status_code !== 2 && r.data?.codigo !== 'LIMITE_PLAN' && Number(marc.n) >= 1,
            `${ r.message } · marcajes ${ marc.n }`);
        r = await llamar('GET', '/empleados/getEmpleados', { token: tN });
        m.revisar('→ ni las consultas', r.status_code === 0, r.message);

        r = await llamar('GET', '/global/getAvisoPlan', { token: await entrar('solo.b') });
        m.revisar('getAvisoPlan solo para quien puede dar de alta empleados', r.status_code === 1 && r.data?.codigo === 'SIN_PERMISO', r.message);
        r = await llamar('GET', '/global/getAvisoPlan', { token: tAdminA });
        m.revisar('→ Demo A (Sin límite) → NINGUNO', r.status_code === 0 && r.data.nivel === 'NINGUNO' && r.data.limite === null, JSON.stringify(r.data));

        // ── Cambio de plan (T20) ──
        r = await panel('POST', '/empresas/setPlanEmpresa', { token: tp, body: { idEmpresa: N, idPlan: planLimite } });
        m.revisar('el mismo plan con el mismo precio → se rechaza', r.status_code === 1 && /ya tiene el plan/.test(r.message), r.message);
        r = await panel('POST', '/empresas/setPlanEmpresa', { token: tp, body: { idEmpresa: N, idPlan: planChico, fechaInicio: '2999-01-01' } });
        m.revisar('fecha de inicio futura → se rechaza', r.status_code === 1 && /futura/.test(r.message), r.message);
        r = await panel('POST', '/empresas/setPlanEmpresa', { token: tp, body: { idEmpresa: N, idPlan: planChico } });
        m.revisar('bajar a un plan con menos límite → advertencia, no guarda', r.status_code === 1 && r.data?.codigo === 'CONFIRMAR_LIMITE'
            && r.data.activos === 5 && r.data.limite === 2, r.message);
        const [sigue] = await sql('SELECT idPlan FROM empresas_planes WHERE idEmpresa = :N AND vigente = 1', { N });
        m.revisar('→ el plan vigente no cambió', sigue.idPlan === planLimite);
        r = await panel('POST', '/empresas/setPlanEmpresa', { token: tp, body: { idEmpresa: N, idPlan: planChico, bConfirmado: true, motivo: 'Lo pidió el cliente' } });
        m.revisar('→ con bConfirmado se guarda', r.status_code === 0 && r.data.advertencia === true, r.message);
        const planesN = await sql('SELECT idPlan, fechaInicio, fechaFin, vigente FROM empresas_planes WHERE idEmpresa = :N ORDER BY idEmpresaPlan', { N });
        m.revisar('→ cierra el vigente y abre el nuevo (uno solo vigente)', planesN.length === 2 && planesN[0].fechaFin === planesN[1].fechaInicio
            && planesN[1].vigente === 1 && planesN[0].vigente === null, JSON.stringify(planesN));
        r = await panel('PUT', '/planes/disablePlan', { token: tp, body: { idPlan: planChico } });
        m.revisar('desactivar un plan en uso → se rechaza', r.status_code === 1 && /lo tienen 1 empresa/.test(r.message), r.message);
        r = await panel('POST', '/planes/insertUpdatePlan', { token: tp, body: { idPlan: planChico, nombre: nOtro, tipoCobro: 'POR_EMPLEADO', precio: 1 } });
        m.revisar('cambiar el tipo de cobro de un plan en uso → se rechaza', r.status_code === 1 && /tipo de cobro/.test(r.message), r.message);
        r = await aviso();
        m.revisar('→ arriba del límite: aviso LIMITE', r.data?.nivel === 'LIMITE' && r.data.activos === 5 && r.data.limite === 2, JSON.stringify(r.data));
        r = await altaEmp(8);
        m.revisar('→ el bloqueo de altas aplica de inmediato', r.status_code === 1 && r.data?.codigo === 'LIMITE_PLAN', r.message);

        // ── Conteo diario (T21) ──
        const { contarEmpleados, usoDelMes } = require('../helpers/panel/conteo');
        const c1 = await contarEmpleados();
        const hoyP = c1.fecha;
        const mes = hoyP.slice(0, 7);
        const fila = async () => (await sql('SELECT empleadosActivos FROM empresas_conteo_diario WHERE idEmpresa = :N AND fecha = :f', { N, f: hoyP }))[0];
        m.revisar('el conteo guarda los activos de cada empresa con el día del producto', (await fila())?.empleadosActivos === 5 && c1.empresas >= 3,
            JSON.stringify(c1));
        await contarEmpleados();
        const [{ n: renglones }] = await sql('SELECT COUNT(*) AS n FROM empresas_conteo_diario WHERE idEmpresa = :N', { N });
        m.revisar('→ repetible el mismo día (un renglón)', Number(renglones) === 1, String(renglones));
        await llamar('POST', '/empleados/bajaEmpleado', { token: tN, body: { idEmpleado: empleados[1], fechaBaja: '2025-06-15', motivoBaja: 'Prueba' } });
        await contarEmpleados();
        m.revisar('→ si bajan los activos en el día, conserva el mayor', (await fila())?.empleadosActivos === 5);
        await ejecutar(`INSERT INTO empresas_conteo_diario (idEmpresa, fecha, empleadosActivos) VALUES (:N, :f, 9)
                        ON DUPLICATE KEY UPDATE empleadosActivos = 9`, { N, f: `${ mes }-01` });
        const uso = await usoDelMes(N, mes);
        m.revisar('usoDelMes: el máximo del mes', uso.maximo === 9, JSON.stringify(uso));
        r = await panel('GET', '/empresas/getEmpresaById', { token: tp, query: `?idEmpresa=${ N }` });
        m.revisar('→ la ficha muestra el uso del mes', r.data?.uso?.[0]?.mes === mes && r.data.uso[0].maximo === 9, JSON.stringify(r.data?.uso?.[0]));

        // ── Cobro (T23) ──
        r = await panel('GET', '/cobro/getCobroMes', { token: tp, query: '?mes=2026-13' });
        m.revisar('mes inválido → se rechaza', r.status_code === 1, r.message);
        r = await panel('GET', '/cobro/getCobroMes', { token: tp, query: `?mes=${ mes }` });
        let cN = r.data?.filas?.find(f => f.idEmpresa === N);
        const cX = r.data?.filas?.find(f => f.idEmpresa === X);
        m.revisar('cobro con límite: precio fijo del plan del mes', r.status_code === 0 && cN?.plan === nOtro && cN.empleadosMes === 9 && cN.importe === 200,
            JSON.stringify(cN));
        m.revisar('→ plan Sin límite: importe 0', cX?.importe === 0 && cX.tipoCobro === 'POR_EMPLEADO', JSON.stringify(cX));
        await panel('PUT', '/planes/enablePlan', { token: tp, body: { idPlan: planEmpleado } });
        r = await panel('POST', '/empresas/setPlanEmpresa', { token: tp, body: { idEmpresa: N, idPlan: planEmpleado, precioEspecial: 7 } });
        m.revisar('cambio a plan por empleado con precio especial', r.status_code === 0 && r.data.advertencia === false, r.message);
        r = await panel('GET', '/cobro/getCobroMes', { token: tp, query: `?mes=${ mes }` });
        cN = r.data?.filas?.find(f => f.idEmpresa === N);
        m.revisar('→ cobro por empleado con precio especial: 7 × 9 = 63', cN?.tipoCobro === 'POR_EMPLEADO' && cN.precioAplicado === 7 && cN.importe === 63,
            JSON.stringify(cN));
        const total = r.data?.total;
        m.revisar('→ el total suma los importes', Math.abs(total - r.data.filas.reduce((s, f) => s + f.importe, 0)) < 0.001, String(total));
        r = await panel('GET', '/cobro/exportarCobroMes', { token: tp, query: `?mes=${ mes }` });
        let hojaOk = false;
        if (r.binario) {
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(r.binario);
            const hoja = wb.worksheets[0];
            const filas = [];
            hoja.eachRow((row) => filas.push(row.values));
            const deN = filas.find(v => v[1] === nombreNueva);
            hojaOk = deN && deN[12] === 63 && filas[filas.length - 1][1] === 'Total';
        }
        m.revisar('exportarCobroMes: Excel con las mismas filas y el total', /spreadsheetml/.test(r.tipo || '') && /cobro-\d{4}-\d{2}\.xlsx/.test(r.disposicion || '')
            && hojaOk, r.message || r.tipo);

        // ── Bitácora del producto ──
        const acciones = new Set((await sql('SELECT accion FROM bitacora_producto WHERE idEmpresa = :N', { N })).map(x => x.accion));
        const faltan = ['EMPRESA_ALTA', 'EMPRESA_DATOS', 'EMPRESA_SUSPENSION', 'EMPRESA_REACTIVACION', 'EMPRESA_MODULOS', 'EMPRESA_PLAN']
            .filter(a => !acciones.has(a));
        const [bpPlan] = await sql("SELECT COUNT(*) AS n FROM bitacora_producto WHERE accion IN ('PLAN_ALTA','PLAN_CAMBIO','PLAN_DESACTIVADO','PLAN_ACTIVADO') AND objeto IN (:ids)",
            { ids: [planLimite, planEmpleado, planChico].map(String) });
        const [bpCambio] = await sql("SELECT antes, despues FROM bitacora_producto WHERE accion = 'EMPRESA_PLAN' AND idEmpresa = :N ORDER BY idBitacora LIMIT 1", { N });
        m.revisar('cada escritura del panel queda en la bitácora del producto, con antes y después',
            !faltan.length && Number(bpPlan.n) >= 6 && json(bpCambio.antes)?.idPlan === planLimite && json(bpCambio.despues)?.idPlan === planChico,
            `faltan: ${ faltan.join(', ') } · planes: ${ bpPlan.n }`);

        // ══ Sesión de soporte (T24 a T27) ══
        const [sa] = await sql('SELECT idSuperadmin, nombre FROM superadmins WHERE correo = :c', { c: process.env.DEMO_PANEL_CORREO });
        r = await panel('POST', '/soporte/entrarEmpresa', { token: tp, body: { idEmpresa: N, motivo: '' } });
        m.revisar('entrar a una empresa sin motivo → se rechaza', r.status_code === 1, r.message);
        r = await panel('POST', '/soporte/entrarEmpresa', { token: tp, body: { idEmpresa: 99999999, motivo: 'x' } });
        m.revisar('entrar a una empresa inexistente → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await llamar('POST', '/panel/soporte/entrarEmpresa', { token: tN, body: { idEmpresa: N, motivo: 'x' } });
        m.revisar('una sesión de empresa no abre una sesión de soporte', r.http === 401, String(r.http));
        r = await panel('POST', '/soporte/entrarEmpresa', { token: tp, body: { idEmpresa: N, motivo: `Ticket de prueba ${ RUN }` } });
        const tS = r.data?.token;
        const ss = r.data?.idSesionSoporte;
        m.revisar('entrar a la empresa con motivo → token de soporte y vence en soporte.sesion_minutos',
            r.status_code === 0 && !!tS && ss > 0 && r.data.minutos > 0 && r.data.empresa?.idEmpresa === N
            && Math.abs(new Date(r.data.vence) - Date.now() - r.data.minutos * 60000) < 120000, r.message);
        r = await llamar('GET', '/auth/getSesion', { token: tS });
        m.revisar('getSesion en soporte: nombre "Soporte", sin usuario, todas las sucursales y soporte { empresa, vence }',
            r.status_code === 0 && r.data.usuario?.nombre === 'Soporte' && r.data.usuario.idUsuario === null && r.data.todasSucursales === true
            && r.data.empresa?.idEmpresa === N && r.data.soporte?.empresa === nombreNueva && !!r.data.soporte.vence
            && r.data.soporte.idSesionSoporte === ss && r.data.empresas.length === 0 && r.data.sucursales.some(s => s.idSucursal === idSucN),
        JSON.stringify(r.data));
        r = await llamar('GET', '/auth/getSesion', { token: tN });
        m.revisar('→ una sesión normal trae soporte: null', r.status_code === 0 && r.data.soporte === null, JSON.stringify(r.data?.soporte));
        r = await llamar('GET', '/global/getUserActions', { token: tS });
        m.revisar('→ en soporte tiene todo lo de los módulos contratados', r.status_code === 0 && r.data.admin === true
            && r.data.acciones.includes('empleados_CreateUpdate') && r.data.acciones.includes('roles_CreateUpdate'), r.message);
        r = await llamar('GET', '/empleados/getEmpleados', { token: tS });
        m.revisar('→ lee los empleados de la empresa', r.status_code === 0, r.message);
        const [empB] = await sql('SELECT idEmpleado FROM empleados WHERE idEmpresa = :b LIMIT 1', { b: ID.B });
        r = await llamar('GET', `/empleados/getEmpleado?idEmpleado=${ empB.idEmpleado }`, { token: tS });
        m.revisar('→ el token de soporte de una empresa no lee otra (empleado de B → no existe)', r.status_code === 1 && /no existe/i.test(r.message), r.message);
        r = await llamar('GET', `/empleados/getEmpleados?estado=todos&porPagina=100&idEmpresa=${ ID.B }`, { token: tS });
        const deB = (await sql('SELECT idEmpleado FROM empleados WHERE idEmpresa = :b', { b: ID.B })).map(x => x.idEmpleado);
        const listaS = r.data?.filas;
        m.revisar('→ con idEmpresa=B en el query sigue trayendo solo los suyos',
            r.status_code === 0 && Array.isArray(listaS) && listaS.length > 0 && !listaS.some(x => deB.includes(x.idEmpleado)), r.message);

        // Lo personal no aplica.
        for (const [metodo, ruta, body] of [['GET', '/cuenta/getMiCuenta'], ['POST', '/cuenta/updateMiCuenta', { nombre: 'X' }],
            ['POST', '/cuenta/cambiarPassword', { actual: 'a', nueva: 'bbbbbbbbb' }], ['GET', '/global/getPreferencias'],
            ['POST', '/global/setPreferencia', { ambito: 'a', clave: 'b', valor: 1 }]]) {
            r = await llamar(metodo, ruta, { token: tS, body });
            m.revisar(`→ ${ ruta } responde que no aplica en soporte`, r.status_code === 1 && r.data?.codigo === 'NO_APLICA_SOPORTE'
                && /No aplica en una sesión de soporte/.test(r.message), r.message);
        }

        // Escrituras de soporte: autor nulo + idSesionSoporte en las cuatro bitácoras.
        r = await llamar('POST', '/configuracion/setConfiguracion', { token: tS, body: { valores: [{ clave: 'asistencia.tolerancia_retardo', valor: 7 }] } });
        m.revisar('soporte cambia un ajuste de configuración', r.status_code === 0, r.message);
        r = await llamar('POST', '/roles/insertUpdateRol', { token: tS, body: { nombre: `Rol soporte ${ RUN }` } });
        m.revisar('soporte crea un rol', r.status_code === 0, r.message);
        r = await llamar('POST', '/empleados/insertUpdateEmpleado', { token: tS, body: {
            nombre: 'Alta', apellidoPaterno: `Soporte ${ RUN }`, idSucursalPrincipal: idSucN, fechaIngreso: '2025-01-01' } });
        m.revisar('soporte da de alta un empleado', r.status_code === 0, r.message);
        r = await llamar('POST', '/dispositivos/insertDispositivo', { token: tS, body: { idSucursal: idSucN, nombre: 'Tableta soporte' } });
        m.revisar('soporte crea un dispositivo', r.status_code === 0, r.message);
        const marcas = {};
        for (const b of ['bitacora_configuracion', 'bitacora_permisos', 'bitacora_empleados', 'bitacora_checador']) {
            const [x] = await sql(`SELECT COUNT(*) AS n, SUM(idUsuarioAutor IS NOT NULL) AS conAutor FROM ${ b } WHERE idEmpresa = :N AND idSesionSoporte = :ss`, { N, ss });
            marcas[b] = `${ x.n }/${ x.conAutor || 0 }`;
        }
        m.revisar('→ las cuatro bitácoras guardan idSesionSoporte y autor nulo', Object.values(marcas).every(v => /^[1-9]\d*\/0$/.test(v)), JSON.stringify(marcas));
        r = await llamar('GET', '/roles/getBitacoraPermisos', { token: tN });
        m.revisar('→ getBitacoraPermisos muestra "Soporte" como autor', r.data?.some(b => b.idSesionSoporte === ss && b.autor === 'Soporte'), r.message);
        r = await llamar('GET', '/configuracion/getBitacoraConfiguracion', { token: tN });
        m.revisar('→ getBitacoraConfiguracion muestra "Soporte" como autor', r.data?.some(b => b.idSesionSoporte === ss && b.autor === 'Soporte'), r.message);

        // Vencida, cerrada, superadministrador desactivado y empresa suspendida.
        r = await panel('POST', '/soporte/entrarEmpresa', { token: tp, body: { idEmpresa: N, motivo: 'Prueba de vencimiento' } });
        const tVence = r.data?.token;
        await ejecutar('UPDATE soporte_sesiones SET vence = :v WHERE idEmpresa = :N AND idSesionSoporte = :id',
            { v: new Date(Date.now() - 60000), N, id: r.data?.idSesionSoporte });
        r = await llamar('GET', '/auth/getSesion', { token: tVence });
        m.revisar('sesión de soporte vencida → 401 SESION_SOPORTE_INVALIDA', r.http === 401 && r.data?.codigo === 'SESION_SOPORTE_INVALIDA', String(r.http));
        await ejecutar('UPDATE superadmins SET bActivo = 0 WHERE idSuperadmin = :id', { id: sa.idSuperadmin });
        try {
            r = await llamar('GET', '/auth/getSesion', { token: tS });
        } finally {
            await ejecutar('UPDATE superadmins SET bActivo = 1 WHERE idSuperadmin = :id', { id: sa.idSuperadmin });
        }
        m.revisar('superadministrador desactivado → su sesión de soporte deja de servir', r.http === 401, String(r.http));
        r = await llamar('GET', '/auth/getSesion', { token: tS });
        m.revisar('→ reactivado, vuelve a servir', r.status_code === 0, r.message);

        r = await panel('POST', '/empresas/suspenderEmpresa', { token: tp, body: { idEmpresa: N, motivo: 'Suspendida para probar soporte' } });
        r = await llamar('GET', '/auth/getSesion', { token: tN });
        const normalSusp = r.http;
        r = await llamar('GET', '/empleados/getEmpleados', { token: tS });
        m.revisar('empresa suspendida: la sesión normal no pasa y la de soporte sí', normalSusp === 401 && r.status_code === 0, `${ normalSusp } · ${ r.message }`);
        r = await panel('POST', '/soporte/entrarEmpresa', { token: tp, body: { idEmpresa: N, motivo: 'Entrar a una suspendida' } });
        m.revisar('→ soporte entra a una empresa suspendida', r.status_code === 0, r.message);
        await panel('POST', '/soporte/salirEmpresa', { token: tp, body: { idSesionSoporte: r.data?.idSesionSoporte } });
        await panel('POST', '/empresas/reactivarEmpresa', { token: tp, body: { idEmpresa: N, motivo: 'Fin de la prueba de soporte' } });

        r = await panel('POST', '/soporte/salirEmpresa', { token: tp, body: { idSesionSoporte: ss } });
        m.revisar('salirEmpresa cierra la sesión', r.status_code === 0 && !!r.data?.fin, r.message);
        r = await llamar('GET', '/auth/getSesion', { token: tS });
        m.revisar('→ la sesión cerrada ya no sirve (401)', r.http === 401 && r.data?.codigo === 'SESION_SOPORTE_INVALIDA', String(r.http));
        r = await panel('POST', '/soporte/salirEmpresa', { token: tp, body: { idSesionSoporte: ss } });
        m.revisar('→ cerrarla otra vez lo dice', r.status_code === 0 && /ya estaba cerrada/.test(r.message), r.message);

        r = await llamar('GET', '/configuracion/getAccesosSoporte', { token: tN });
        const acc = r.data?.find(a => a.idSesionSoporte === ss);
        m.revisar('getAccesosSoporte: la empresa ve quién entró, por qué, cuándo y cuánto duró',
            r.status_code === 0 && acc?.motivo === `Ticket de prueba ${ RUN }` && acc.superadmin === sa.nombre && acc.estado === 'CERRADA'
            && acc.minutos >= 0 && !!acc.inicio && !!acc.fin && r.data.some(a => a.estado === 'VENCIDA') && r.data.length === 3, JSON.stringify(r.data));
        r = await llamar('GET', '/configuracion/getAccesosSoporte', { token: tAdminA });
        m.revisar('→ otra empresa no ve los accesos de esta', r.status_code === 0 && !r.data.some(a => a.idSesionSoporte === ss), r.message);
        const [bpSop] = await sql(`SELECT SUM(accion = 'SOPORTE_ENTRADA') AS e, SUM(accion = 'SOPORTE_SALIDA') AS s
                                     FROM bitacora_producto WHERE idEmpresa = :N`, { N });
        m.revisar('→ cada entrada y salida queda en la bitácora del producto', Number(bpSop.e) === 3 && Number(bpSop.s) === 2, JSON.stringify(bpSop));

        // ══ Constantes (T31 a T33) ══
        const CLAVE_AVISO = 'plan.aviso_porcentaje';
        const avisoDe = async (token) => (await llamar('GET', '/global/getAvisoPlan', { token })).data?.avisoPorcentaje;
        r = await panel('GET', '/constantes/getConstantes', { token: tp });
        const grupoPanel = r.data?.find(g => g.grupo === 'Panel');
        const cAviso = grupoPanel?.constantes.find(c => c.clave === CLAVE_AVISO);
        avisoOriginal = cAviso?.valor;
        m.revisar('getConstantes: agrupadas, con su valor en su tipo y empresas con valor propio',
            r.status_code === 0 && typeof cAviso?.valor === 'number' && typeof cAviso.empresasConValor === 'number' && cAviso.validacion?.max === 99,
            JSON.stringify(cAviso));
        r = await panel('GET', '/constantes/getConstantes', { token: tp, query: '?q=aviso' });
        m.revisar('→ búsqueda por clave o etiqueta', r.status_code === 0 && r.data.flatMap(g => g.constantes).every(c => /aviso/i.test(c.clave + c.etiqueta))
            && r.data.flatMap(g => g.constantes).some(c => c.clave === CLAVE_AVISO), JSON.stringify(r.data));
        r = await panel('POST', '/constantes/setValorGlobal', { token: tp, body: { clave: CLAVE_AVISO, valor: 0 } });
        m.revisar('valor global fuera de rango → se rechaza con el rango', r.status_code === 1 && /entre 1 y 99/.test(r.message), r.message);
        r = await panel('POST', '/constantes/setValorGlobal', { token: tp, body: { clave: CLAVE_AVISO, valor: 'mucho' } });
        m.revisar('valor global de otro tipo → se rechaza', r.status_code === 1 && /entero/.test(r.message), r.message);
        r = await panel('GET', '/constantes/getImpactoGlobal', { token: tp, query: `?clave=${ CLAVE_AVISO }` });
        m.revisar('getImpactoGlobal: cuántas empresas usan el global', r.status_code === 0 && r.data.usanGlobal >= 3
            && r.data.usanGlobal === r.data.empresas - r.data.conValorPropio, JSON.stringify(r.data));
        const nuevoGlobal = avisoOriginal === 70 ? 71 : 70;
        r = await panel('POST', '/constantes/setValorGlobal', { token: tp, body: { clave: CLAVE_AVISO, valor: nuevoGlobal } });
        m.revisar('cambiar el valor global', r.status_code === 0 && r.data.valor === nuevoGlobal, r.message);
        m.revisar('→ constantes.valor lo refleja de inmediato (getAvisoPlan de Demo A)', await avisoDe(tAdminA) === nuevoGlobal);
        r = await panel('POST', '/constantes/setValorEmpresa', { token: tp, body: { clave: CLAVE_AVISO, idEmpresa: N, valor: 150 } });
        m.revisar('valor de empresa fuera de rango → se rechaza', r.status_code === 1, r.message);
        r = await panel('POST', '/constantes/setValorEmpresa', { token: tp, body: { clave: CLAVE_AVISO, idEmpresa: N, valor: 50 } });
        m.revisar('fijar el valor de una empresa', r.status_code === 0, r.message);
        m.revisar('→ esa empresa lo ve de inmediato y las demás siguen con el global',
            await avisoDe(tN) === 50 && await avisoDe(tAdminA) === nuevoGlobal);
        r = await panel('GET', '/constantes/getValoresEmpresas', { token: tp, query: `?clave=${ CLAVE_AVISO }` });
        m.revisar('getValoresEmpresas: qué empresas tienen valor propio y cuál', r.status_code === 0 && r.data.valores.some(v => v.idEmpresa === N && v.valor === 50),
            JSON.stringify(r.data?.valores));
        r = await panel('GET', '/constantes/getConstantesDeEmpresa', { token: tp, query: `?idEmpresa=${ N }` });
        const deN = r.data?.flatMap(g => g.constantes).find(c => c.clave === CLAVE_AVISO);
        m.revisar('getConstantesDeEmpresa: global, propio y efectivo', r.status_code === 0 && deN?.bPropio === true && deN.valorEmpresa === 50
            && deN.valor === nuevoGlobal && deN.valorEfectivo === 50, JSON.stringify(deN));
        r = await panel('POST', '/constantes/quitarValorEmpresa', { token: tp, body: { clave: CLAVE_AVISO, idEmpresa: N } });
        m.revisar('quitar el valor de la empresa', r.status_code === 0, r.message);
        m.revisar('→ regresa al global de inmediato', await avisoDe(tN) === nuevoGlobal);
        r = await panel('POST', '/constantes/setValorGlobal', { token: tp, body: { clave: CLAVE_AVISO, valor: avisoOriginal } });
        m.revisar('→ el global regresa a su valor', r.status_code === 0 && await avisoDe(tAdminA) === avisoOriginal, r.message);
        avisoOriginal = undefined;

        const CLAVE = `prueba.panel_${ RUN.toLowerCase() }`;
        const defNueva = { clave: CLAVE, grupo: 'Pruebas', orden: 1, etiqueta: 'Constante de prueba', ayuda: 'Solo pruebas',
            tipoDato: 'entero', control: 'input', validacion: { min: 1, max: 10 }, valor: 5 };
        r = await panel('POST', '/constantes/insertConstante', { token: tp, body: { ...defNueva, clave: 'Mala Clave' } });
        m.revisar('alta con clave inválida → se rechaza', r.status_code === 1 && /clave/.test(r.message), r.message);
        r = await panel('POST', '/constantes/insertConstante', { token: tp, body: { ...defNueva, valor: 20 } });
        m.revisar('alta con valor fuera de su validación → se rechaza', r.status_code === 1 && /entre 1 y 10/.test(r.message), r.message);
        r = await panel('POST', '/constantes/insertConstante', { token: tp, body: { ...defNueva, control: 'switch' } });
        m.revisar('alta con un control que no va con el tipo → se rechaza', r.status_code === 1 && /booleano/.test(r.message), r.message);
        r = await panel('POST', '/constantes/insertConstante', { token: tp, body: defNueva });
        m.revisar('alta de constante', r.status_code === 0 && r.data.clave === CLAVE, r.message);
        r = await panel('POST', '/constantes/insertConstante', { token: tp, body: defNueva });
        m.revisar('→ la misma clave otra vez → se rechaza', r.status_code === 1 && /Ya existe/.test(r.message), r.message);
        r = await panel('POST', '/constantes/setValorEmpresa', { token: tp, body: { clave: CLAVE, idEmpresa: N, valor: 8 } });
        m.revisar('→ valor propio de una empresa (8)', r.status_code === 0, r.message);
        const defEdit = { clave: CLAVE, grupo: 'Pruebas', orden: 1, etiqueta: 'Constante de prueba', ayuda: 'Solo pruebas', control: 'input' };
        r = await panel('POST', '/constantes/updateDefinicionConstante', { token: tp, body: { ...defEdit, validacion: { min: 1, max: 6 } } });
        m.revisar('definición que deja inválido el valor de una empresa → no guarda y dice cuál',
            r.status_code === 1 && r.data?.codigo === 'VALORES_INVALIDOS' && r.data.invalidos.length === 1 && r.data.invalidos[0].idEmpresa === N
            && r.data.invalidos[0].valor === 8, JSON.stringify(r.data));
        r = await panel('POST', '/constantes/updateDefinicionConstante', { token: tp, body: { ...defEdit, validacion: { min: 1, max: 4 } } });
        m.revisar('→ también el global (lista los dos)', r.status_code === 1 && r.data?.invalidos?.some(x => x.idEmpresa === null && x.valor === 5)
            && r.data.invalidos.some(x => x.idEmpresa === N), JSON.stringify(r.data));
        const [sinCambio] = await sql('SELECT validacion FROM cat_constantes WHERE clave = :c', { c: CLAVE });
        m.revisar('→ la definición no cambió', json(sinCambio.validacion)?.max === 10, JSON.stringify(sinCambio));
        r = await panel('POST', '/constantes/updateDefinicionConstante', { token: tp, body: { ...defEdit, tipoDato: 'texto', validacion: { min: 1, max: 10 } } });
        m.revisar('el tipo de dato no se cambia', r.status_code === 1 && /tipo de dato/.test(r.message), r.message);
        r = await panel('POST', '/constantes/updateDefinicionConstante', { token: tp, body: { ...defEdit, etiqueta: 'Constante editada', grupo: 'Pruebas 2',
            validacion: { min: 1, max: 9, unidad: 'veces' } } });
        const [editada] = await sql('SELECT clave, tipoDato, etiqueta, grupo, validacion FROM cat_constantes WHERE clave = :c', { c: CLAVE });
        m.revisar('editar etiqueta, grupo y validación; clave y tipo se quedan', r.status_code === 0 && editada.etiqueta === 'Constante editada'
            && editada.grupo === 'Pruebas 2' && editada.tipoDato === 'entero' && editada.clave === CLAVE && json(editada.validacion).unidad === 'veces', r.message);
        r = await panel('PUT', '/constantes/disableConstante', { token: tp, body: { clave: CLAVE, claveConfirmacion: 'prueba.otra' } });
        m.revisar('desactivar con la clave mal escrita → se rechaza', r.status_code === 1 && /exactamente igual/.test(r.message), r.message);
        r = await panel('PUT', '/constantes/disableConstante', { token: tp, body: { clave: CLAVE, claveConfirmacion: CLAVE } });
        m.revisar('desactivar escribiendo la clave', r.status_code === 0, r.message);
        r = await panel('GET', '/constantes/getConstantes', { token: tp, query: `?q=${ CLAVE }` });
        const r2 = await panel('GET', '/constantes/getConstantes', { token: tp, query: `?q=${ CLAVE }&incluirInactivas=1` });
        m.revisar('→ ya no sale entre las activas (sí con incluirInactivas)', r.data?.length === 0
            && r2.data?.[0]?.constantes?.[0]?.bActivo === false, JSON.stringify(r2.data));
        r = await panel('PUT', '/constantes/enableConstante', { token: tp, body: { clave: CLAVE } });
        m.revisar('activarla otra vez', r.status_code === 0, r.message);
        const accC = (await sql(`SELECT accion, antes, despues FROM bitacora_producto WHERE objeto IN (:c) AND accion LIKE 'CONSTANTE%' ORDER BY idBitacora`,
            { c: [CLAVE, CLAVE_AVISO] }));
        const vg = accC.filter(x => x.accion === 'CONSTANTE_VALOR_GLOBAL').slice(-2);
        m.revisar('→ cada cambio de constante en la bitácora, con el antes y el después',
            ['CONSTANTE_ALTA', 'CONSTANTE_VALOR_EMPRESA', 'CONSTANTE_VALOR_EMPRESA_QUITADO', 'CONSTANTE_DEFINICION', 'CONSTANTE_DESACTIVADA', 'CONSTANTE_ACTIVADA']
                .every(a => accC.some(x => x.accion === a))
            && json(vg[0]?.antes) === json(vg[1]?.despues) && json(vg[0]?.despues) === nuevoGlobal, JSON.stringify(vg));

        // ══ Bitácora del producto (T34) ══
        r = await panel('GET', '/bitacora/getBitacora', { token: tp, query: `?idEmpresa=${ N }&accion=EMPRESA_ALTA` });
        m.revisar('getBitacora filtra por empresa y acción', r.status_code === 0 && r.data.total === 1 && r.data.filas[0].empresa === nombreNueva
            && r.data.filas[0].despues?.nombreComercial === nombreNueva, JSON.stringify(r.data));
        r = await panel('GET', '/bitacora/getBitacora', { token: tp, query: `?idEmpresa=${ N }&porPagina=3&pagina=1` });
        const p2 = await panel('GET', '/bitacora/getBitacora', { token: tp, query: `?idEmpresa=${ N }&porPagina=3&pagina=2` });
        m.revisar('→ paginada (sin repetir entre páginas, del más reciente)', r.data?.filas?.length === 3 && p2.data?.filas?.length === 3
            && r.data.total === p2.data.total && r.data.total > 6 && r.data.filas[2].idBitacora > p2.data.filas[0].idBitacora, `${ r.data?.total }`);
        const hoyBit = c1.fecha;
        r = await panel('GET', '/bitacora/getBitacora', { token: tp, query: `?desde=${ hoyBit }&hasta=${ hoyBit }&idSuperadmin=${ sa.idSuperadmin }&porPagina=200` });
        m.revisar('→ por fecha y superadministrador', r.status_code === 0 && r.data.total > 0 && r.data.filas.every(f => f.idSuperadmin === sa.idSuperadmin), r.message);
        r = await panel('GET', '/bitacora/getBitacora', { token: tp, query: '?desde=2026-02-30' });
        m.revisar('→ fecha inválida → se rechaza', r.status_code === 1, r.message);
        r = await panel('GET', '/bitacora/getFiltrosBitacora', { token: tp });
        m.revisar('getFiltrosBitacora: superadministradores y acciones', r.status_code === 0 && r.data.acciones.includes('SOPORTE_ENTRADA')
            && r.data.superadmins.some(s => s.idSuperadmin === sa.idSuperadmin), r.message);

        // ══ Baja definitiva (T28 a T30) ══
        const { eliminarEmpresa, bajasVencidas } = require('../helpers/panel/eliminacionEmpresa');
        const [empN] = await sql("SELECT idEmpleado FROM empleados WHERE idEmpresa = :N AND estado = 'ACTIVO' LIMIT 1", { N });
        await ejecutar(`INSERT INTO empleados_rostros (idEmpresa, idEmpleado, descriptores, tomas, fechaRegistro)
                        VALUES (:N, :e, '[[0.1,0.2]]', 1, UTC_TIMESTAMP())`, { N, e: empN.idEmpleado });
        // Una cuenta compartida (admin.b tiene otra empresa) y la del administrador, que solo es de N.
        const [ub] = await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo('admin.b') });
        await ejecutar('INSERT INTO usuarios_empresa (idEmpresa, idUsuario, bActivo, bTodasSucursales) VALUES (:N, :u, 1, 1)', { N, u: ub.idUsuario });
        fs.mkdirSync(path.join(__dirname, '..', 'almacen', 'evidencias', String(N)), { recursive: true });
        fs.writeFileSync(path.join(__dirname, '..', 'almacen', 'evidencias', String(N), 'prueba.jpg'), fotoJpeg());

        r = await panel('POST', '/empresas/iniciarBaja', { token: tp, body: { idEmpresa: N, nombreConfirmacion: nombreNueva.toUpperCase(), motivo: 'Cancela el servicio' } });
        m.revisar('baja con el nombre mal escrito → se rechaza', r.status_code === 1 && /exactamente igual/.test(r.message), r.message);
        r = await panel('POST', '/empresas/iniciarBaja', { token: tp, body: { idEmpresa: N, nombreConfirmacion: nombreNueva, motivo: '' } });
        m.revisar('baja sin motivo → se rechaza', r.status_code === 1, r.message);
        r = await panel('POST', '/empresas/iniciarBaja', { token: tp, body: { idEmpresa: N, nombreConfirmacion: ` ${ nombreNueva } `, motivo: 'Cancela el servicio' } });
        const [dg] = await sql("SELECT valor FROM cat_constantes WHERE clave = 'baja.dias_gracia'");
        m.revisar('iniciar la baja: exportación y eliminación programada a baja.dias_gracia días',
            r.status_code === 0 && r.data.idExportacion > 0 && r.data.tamano > 0 && r.data.diasGracia === Number(dg.valor)
            && Math.abs(new Date(r.data.fechaBajaProgramada) - Date.now() - Number(dg.valor) * 86400000) < 600000, r.message);
        const [estN] = await sql('SELECT estado, fechaBajaProgramada FROM empresas WHERE idEmpresa = :N', { N });
        m.revisar('→ queda EN_BAJA', estN.estado === 'EN_BAJA' && !!estN.fechaBajaProgramada, JSON.stringify(estN));
        r = await panel('GET', '/empresas/descargarExportacion', { token: tp, query: `?idEmpresa=${ N }` });
        let libro = null;
        if (r.binario) { libro = new ExcelJS.Workbook(); await libro.xlsx.load(r.binario); }
        const hojas = libro ? libro.worksheets.map(w => w.name) : [];
        const encabezados = (n) => { const w = libro?.getWorksheet(n); return w ? (w.getRow(1).values || []).filter(Boolean) : []; };
        const filasDe = (n) => (libro?.getWorksheet(n)?.rowCount || 1) - 1;
        m.revisar('descargarExportacion: un Excel con una hoja por tabla (empleados, marcajes, usuarios…)', /spreadsheetml/.test(r.tipo || '')
            && ['Resumen', 'empleados', 'marcajes', 'usuarios_empresa', 'sucursales', 'puestos', 'dispositivos', 'bitacora_empleados'].every(h => hojas.includes(h))
            && filasDe('empleados') >= 6 && filasDe('marcajes') >= 1, `${ r.message || r.tipo } · ${ hojas.join(',') }`);
        m.revisar('→ sin rostros: ni la hoja ni descriptores en ninguna hoja', !hojas.includes('empleados_rostros')
            && hojas.every(h => !encabezados(h).includes('descriptores')), hojas.join(','));
        m.revisar('→ sin secretos ni rutas de archivos (llaves, contraseñas, fotos)', !encabezados('dispositivos').includes('llaveHash')
            && !encabezados('usuarios_empresa').includes('passwordHash') && encabezados('usuarios_empresa').includes('correo')
            && !encabezados('marcajes_evidencias').includes('archivo') && !encabezados('empleados').includes('foto'), JSON.stringify(encabezados('usuarios_empresa')));
        const [bpDesc] = await sql("SELECT COUNT(*) AS n FROM bitacora_producto WHERE idEmpresa = :N AND accion = 'EMPRESA_EXPORTACION_DESCARGA'", { N });
        m.revisar('→ la descarga queda en la bitácora del producto', Number(bpDesc.n) === 1);
        r = await llamar('POST', '/auth/login', { body: { correo: CORREO_NUEVO, password: provisional } });
        m.revisar('EN_BAJA: nadie entra, con un mensaje distinto al de suspendida', r.status_code === 1 && /dada de baja/.test(r.message), r.message);
        r = await llamar('GET', '/auth/getSesion', { token: tN });
        m.revisar('→ la sesión abierta termina (401, "dada de baja")', r.http === 401 && /dada de baja/.test(r.message), r.message);
        r = await disp('POST', '/latido', llave);
        m.revisar('→ su dispositivo no checa (EMPRESA_EN_BAJA)', r.status_code === 1 && r.data?.codigo === 'EMPRESA_EN_BAJA', r.message);
        r = await panel('POST', '/soporte/entrarEmpresa', { token: tp, body: { idEmpresa: N, motivo: 'Entrar en baja' } });
        m.revisar('→ soporte tampoco entra', r.status_code === 1 && /en baja/.test(r.message), r.message);
        r = await panel('POST', '/empresas/iniciarBaja', { token: tp, body: { idEmpresa: N, nombreConfirmacion: nombreNueva, motivo: 'Otra vez' } });
        m.revisar('→ dar de baja otra vez → se rechaza', r.status_code === 1, r.message);
        let error = null;
        try { await eliminarEmpresa(N); } catch (e) { error = e; }
        m.revisar('la eliminación no procede dentro del periodo de gracia (lo valida la función)', /no ha vencido/.test(error?.message || ''), error?.message);
        r = await panel('POST', '/empresas/revertirBaja', { token: tp, body: { idEmpresa: N, motivo: 'Se arrepintió' } });
        const [revN] = await sql('SELECT estado, fechaBajaProgramada FROM empresas WHERE idEmpresa = :N', { N });
        m.revisar('revertir la baja dentro del periodo → SUSPENDIDA', r.status_code === 0 && revN.estado === 'SUSPENDIDA' && revN.fechaBajaProgramada === null,
            `${ r.message } · ${ JSON.stringify(revN) }`);
        r = await panel('POST', '/empresas/iniciarBaja', { token: tp, body: { idEmpresa: N, nombreConfirmacion: nombreNueva, motivo: 'Ahora sí' } });
        m.revisar('→ una suspendida también se da de baja', r.status_code === 0, r.message);
        await ejecutar('UPDATE empresas SET fechaBajaProgramada = :f WHERE idEmpresa = :N', { f: new Date(Date.now() - 60000), N });
        r = await panel('POST', '/empresas/revertirBaja', { token: tp, body: { idEmpresa: N, motivo: 'Tarde' } });
        m.revisar('revertir después del periodo de gracia → se rechaza', r.status_code === 1 && /ya venció/.test(r.message), r.message);
        m.revisar('bajasVencidas la encuentra', (await bajasVencidas()).some(e => e.idEmpresa === N));

        const antesElim = {};
        for (const t of ['empresas_historial', 'empresas_planes', 'empresas_conteo_diario']) {
            antesElim[t] = Number((await sql(`SELECT COUNT(*) AS n FROM ${ t } WHERE idEmpresa = :N`, { N }))[0].n);
        }
        const elim = await eliminarEmpresa(N);
        const quedan = {};
        for (const t of ORDEN_BORRADO) {
            const [x] = await sql(`SELECT COUNT(*) AS n FROM ${ t } WHERE idEmpresa = :N`, { N });
            if (Number(x.n)) quedan[t] = Number(x.n);
        }
        m.revisar('eliminación: cero filas de la empresa en cada tabla borrada, biometría incluida',
            !Object.keys(quedan).length && elim.filas.empleados_rostros === 1 && elim.filas.marcajes >= 1 && elim.filas.empleados >= 6,
            JSON.stringify({ quedan, filas: elim.filas }));
        m.revisar('→ carpetas del almacén borradas (archivos y evidencias)',
            !fs.existsSync(path.join(__dirname, '..', 'almacen', 'empresas', String(N)))
            && !fs.existsSync(path.join(__dirname, '..', 'almacen', 'evidencias', String(N))));
        const [huerfana] = await sql('SELECT COUNT(*) AS n FROM usuarios WHERE correo = :c', { c: CORREO_NUEVO });
        const [compartida] = await sql('SELECT COUNT(*) AS n FROM usuarios WHERE idUsuario = :u', { u: ub.idUsuario });
        m.revisar('→ la cuenta que solo era de esta empresa se elimina; la compartida se conserva',
            Number(huerfana.n) === 0 && Number(compartida.n) === 1 && elim.cuentasEliminadas === 1 && elim.cuentasConservadas === 1, JSON.stringify(elim));
        const [finN] = await sql('SELECT estado, nombreComercial, razonSocial, rfc, fechaEliminacion FROM empresas WHERE idEmpresa = :N', { N });
        const despuesElim = {};
        for (const t of Object.keys(antesElim)) despuesElim[t] = Number((await sql(`SELECT COUNT(*) AS n FROM ${ t } WHERE idEmpresa = :N`, { N }))[0].n);
        const [hElim] = await sql("SELECT COUNT(*) AS n FROM empresas_historial WHERE idEmpresa = :N AND tipo = 'ELIMINACION'", { N });
        m.revisar('→ queda la empresa ELIMINADA con sus datos fiscales, su historial (+ELIMINACION), sus planes y sus conteos',
            finN.estado === 'ELIMINADA' && finN.nombreComercial === nombreNueva && finN.rfc === 'PPA010101AB2' && !!finN.fechaEliminacion
            && despuesElim.empresas_historial === antesElim.empresas_historial + 1 && Number(hElim.n) === 1
            && despuesElim.empresas_planes === antesElim.empresas_planes && despuesElim.empresas_conteo_diario === antesElim.empresas_conteo_diario
            && antesElim.empresas_conteo_diario > 0, JSON.stringify({ antesElim, despuesElim, finN }));
        error = null;
        try { await eliminarEmpresa(N); } catch (e) { error = e; }
        m.revisar('→ eliminarla otra vez → se rechaza', /no está en baja/.test(error?.message || ''), error?.message);
        r = await disp('POST', '/latido', llave);
        m.revisar('→ el dispositivo ya no existe', r.status_code === 1 && r.data?.codigo === 'DISPOSITIVO_DESCONOCIDO', r.message);
        r = await panel('POST', '/empresas/reactivarEmpresa', { token: tp, body: { idEmpresa: N, motivo: 'x' } });
        m.revisar('→ una eliminada no se reactiva', r.status_code === 1, r.message);
    } catch (e) {
        m.revisar('la prueba terminó sin excepción', false, e.stack || e.message);
    } finally {
        if (avisoOriginal !== undefined) {
            await ejecutar("UPDATE cat_constantes SET valor = :v WHERE clave = 'plan.aviso_porcentaje'", { v: String(avisoOriginal) });
            console.log('(plan.aviso_porcentaje restaurado en la base; la caché del servidor dura hasta 5 min)');
        }
        const n = await limpiar();
        console.log(`(limpieza: ${ n } empresa(s) de prueba borradas)`);
    }
    await m.terminar('Pruebas del panel');
})();
