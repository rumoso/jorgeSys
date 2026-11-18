// =============================================================================
// Face ID: consentimiento y registro del rostro (análisis 005 §6, LP-5)
// =============================================================================
// - El texto del consentimiento es de la empresa y tiene versión: cada cambio
//   crea una versión nueva.
// - Sin consentimiento vigente no se registra ni se usa el rostro. Retirarlo
//   ELIMINA el rostro en la misma transacción.
// - El rostro se registra con prueba de vida (reto de giros), calidad mínima
//   y `faceid.tomas_registro` tomas. Si se parece al de otro empleado de la
//   empresa, se avisa y solo se guarda con la confirmación explícita.
// - Ninguna respuesta lleva descriptores: nunca salen del servidor.
// =============================================================================

const crypto = require('crypto');
const { db, QueryTypes } = require('../helpers/db');
const fechas = require('../helpers/fechas');
const constantes = require('../helpers/constantes');
const faceid = require('../helpers/faceid');
const faceVida = require('../helpers/faceVida');
const faceReto = require('../helpers/faceReto');
const { registrar } = require('../helpers/bitacoraChecador');

const MSG_NO_EXISTE = 'El empleado no existe';
const MEDIOS = ['PAPEL_FIRMADO', 'EN_PANTALLA'];
const MIN_CONFIRMAR = 3;

// Capturas ya validadas que esperan la confirmación por parecido: token → { … }.
const pendientes = new Map();
const limpiarPendientes = () => { const a = Date.now(); for (const [k, p] of pendientes) if (p.vence <= a) pendientes.delete(k); };

// En una sesión de soporte (009) no hay usuario: la captura es de esa sesión.
const duenio = (req) => (req.soporte ? `s:${ req.idEmpresa }:${ req.soporte.idSesionSoporte }` : `u:${ req.idEmpresa }:${ req.uid }`);
const nombreDe = (e) => [e.nombre, e.apellidoPaterno, e.apellidoMaterno].filter(Boolean).join(' ');

/** El empleado de la empresa, dentro de las sucursales del usuario (o undefined). */
const empleadoDe = async (req, idEmpleado) => {
    const [e] = await db.empresa(req).query(`
        SELECT idEmpleado, numeroEmpleado, nombre, apellidoPaterno, apellidoMaterno, estado,
               idSucursalPrincipal, idSucursalOperativa
          FROM empleados WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado`,
    { replacements: { idEmpleado: Number(idEmpleado) || 0 } });
    if (!e) return undefined;
    if (!req.todasSucursales && ![e.idSucursalPrincipal, e.idSucursalOperativa].some(s => req.sucursalesPermitidas.includes(Number(s)))) return undefined;
    return { ...e, nombreCompleto: nombreDe(e) };
};

const textoVigente = async (req, t) => (await db.empresa(req).query(`
    SELECT version, texto, vigenteDesde FROM consentimientos_texto
     WHERE idEmpresa = :idEmpresa ORDER BY version DESC LIMIT 1`, { transaction: t }))[0];

const consentimientoVigente = async (req, idEmpleado, t) => (await db.empresa(req).query(`
    SELECT idConsentimiento, version, fechaAceptacion, evidencia FROM empleados_consentimientos
     WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado AND fechaRetiro IS NULL
     ORDER BY idConsentimiento DESC LIMIT 1`, { replacements: { idEmpleado }, transaction: t }))[0];

// ── Texto del consentimiento ─────────────────────────────────────────────────

/** GET /api/faceid/getConsentimientoTexto → { version, texto, vigenteDesde, versiones } */
const getConsentimientoTexto = async (req, res) => {
    try {
        const vigente = await textoVigente(req);
        const [n] = await db.empresa(req).query('SELECT COUNT(*) AS n FROM consentimientos_texto WHERE idEmpresa = :idEmpresa');
        return res.json({ status_code: 0, message: vigente ? `Versión ${ vigente.version }` : 'Sin texto',
            data: vigente ? { ...vigente, versiones: Number(n.n) } : null });
    } catch (error) {
        console.error('getConsentimientoTexto', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar el consentimiento', data: null });
    }
};

/** POST /api/faceid/insertConsentimientoTexto { texto } — crea la versión siguiente. */
const insertConsentimientoTexto = async (req, res) => {
    const texto = String(req.body.texto || '').trim();
    try {
        const data = await db.transaccion(async (t) => {
            const anterior = await textoVigente(req, t);
            if (anterior && anterior.texto.trim() === texto) return null;
            const version = (anterior?.version || 0) + 1;
            await db.empresa(req).query(`
                INSERT INTO consentimientos_texto (idEmpresa, version, texto, idUsuarioCreo, vigenteDesde)
                VALUES (:idEmpresa, :version, :texto, :uid, :ahora)`,
            { replacements: { version, texto, uid: req.uid, ahora: fechas.ahora() }, type: QueryTypes.INSERT, transaction: t });
            await registrar(req, { tipo: 'CONSENTIMIENTO_TEXTO', descripcion: `Texto del consentimiento: versión ${ version }`,
                antes: anterior ? { version: anterior.version } : null, despues: { version } }, t);
            return { version };
        });
        if (!data) return res.json({ status_code: 1, message: 'El texto no cambió', data: null });
        return res.json({ status_code: 0, message: `Versión ${ data.version } guardada; es la vigente desde ahora`, data: { id: data.version } });
    } catch (error) {
        if (error?.original?.errno === 1062) return res.json({ status_code: 1, message: 'Alguien más guardó una versión al mismo tiempo; vuelve a abrir el texto', data: null });
        console.error('insertConsentimientoTexto', error);
        return res.json({ status_code: 2, message: 'No fue posible guardar el consentimiento', data: null });
    }
};

// ── Estado del empleado ──────────────────────────────────────────────────────

/** GET /api/faceid/getRostroEmpleado?idEmpleado= — estado, quién y cuándo; nunca el descriptor. */
const getRostroEmpleado = async (req, res) => {
    try {
        const e = await empleadoDe(req, req.query.idEmpleado);
        if (!e) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        const vigente = await textoVigente(req);
        const c = await consentimientoVigente(req, e.idEmpleado);
        const [r] = await db.empresa(req).query(`
            SELECT r.fechaRegistro, r.tomas, u.nombre AS registradoPor
              FROM empleados_rostros r LEFT JOIN usuarios u ON u.idUsuario = r.idUsuarioRegistro
             WHERE r.idEmpresa = :idEmpresa AND r.idEmpleado = :idEmpleado`,
        { replacements: { idEmpleado: e.idEmpleado } });
        const estado = !c ? 'SIN_CONSENTIMIENTO' : !r ? 'SIN_ROSTRO' : 'REGISTRADO';
        return res.json({ status_code: 0, message: estado, data: {
            empleado: { idEmpleado: e.idEmpleado, numeroEmpleado: e.numeroEmpleado, nombre: e.nombreCompleto, estado: e.estado },
            estado,
            consentimiento: c ? { version: c.version, fechaAceptacion: c.fechaAceptacion,
                evidencia: typeof c.evidencia === 'string' ? JSON.parse(c.evidencia) : c.evidencia,
                hayVersionNueva: !!vigente && vigente.version > c.version } : null,
            textoVigente: vigente || null,
            rostro: r || null,
            tomasRegistro: await constantes.valor('faceid.tomas_registro', req)
        } });
    } catch (error) {
        console.error('getRostroEmpleado', error);
        return res.json({ status_code: 2, message: 'No fue posible consultar el Face ID del empleado', data: null });
    }
};

/** POST /api/faceid/aceptarConsentimiento { idEmpleado, version, medio, nota? } */
const aceptarConsentimiento = async (req, res) => {
    const medio = String(req.body.medio || '');
    const nota = req.body.nota ? String(req.body.nota).trim().slice(0, 250) : null;
    try {
        const e = await empleadoDe(req, req.body.idEmpleado);
        if (!e) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        if (e.estado !== 'ACTIVO') return res.json({ status_code: 1, message: 'El empleado está dado de baja', data: null });
        if (!MEDIOS.includes(medio)) return res.json({ status_code: 1, message: 'Indica cómo consta la aceptación', data: null });
        const data = await db.transaccion(async (t) => {
            const vigente = await textoVigente(req, t);
            if (!vigente || Number(req.body.version) !== vigente.version) return { error: 'El texto cambió mientras lo leías. Vuelve a mostrarlo.' };
            const previo = await consentimientoVigente(req, e.idEmpleado, t);
            const ahora = fechas.ahora();
            if (previo) {
                if (previo.version === vigente.version) return { error: 'El empleado ya aceptó la versión vigente' };
                // Acepta una versión nueva: la anterior se cierra sin tocar el rostro.
                await db.empresa(req).query(`
                    UPDATE empleados_consentimientos SET fechaRetiro = :ahora, idUsuarioRetiro = :uid, motivoRetiro = :motivo
                     WHERE idEmpresa = :idEmpresa AND idConsentimiento = :id`,
                { replacements: { ahora, uid: req.uid, motivo: `Reemplazado por la versión ${ vigente.version }`, id: previo.idConsentimiento },
                    type: QueryTypes.UPDATE, transaction: t });
            }
            const [id] = await db.empresa(req).query(`
                INSERT INTO empleados_consentimientos (idEmpresa, idEmpleado, version, fechaAceptacion, evidencia, idUsuarioRegistro)
                VALUES (:idEmpresa, :idEmpleado, :version, :ahora, :evidencia, :uid)`,
            { replacements: { idEmpleado: e.idEmpleado, version: vigente.version, ahora,
                evidencia: JSON.stringify({ medio, nota, ip: req.ip }), uid: req.uid }, type: QueryTypes.INSERT, transaction: t });
            await registrar(req, { tipo: 'CONSENTIMIENTO_ACEPTADO', idEmpleado: e.idEmpleado,
                descripcion: `${ e.nombreCompleto } aceptó el consentimiento (versión ${ vigente.version })`, despues: { version: vigente.version, medio } }, t);
            return { id };
        });
        if (data.error) return res.json({ status_code: 1, message: data.error, data: null });
        return res.json({ status_code: 0, message: 'Consentimiento registrado', data: { id: data.id } });
    } catch (error) {
        console.error('aceptarConsentimiento', error);
        return res.json({ status_code: 2, message: 'No fue posible registrar el consentimiento', data: null });
    }
};

/** POST /api/faceid/retirarConsentimiento { idEmpleado, motivo? } — elimina el rostro en la misma transacción. */
const retirarConsentimiento = async (req, res) => {
    const motivo = req.body.motivo ? String(req.body.motivo).trim().slice(0, 250) : 'Retiro del consentimiento';
    try {
        const e = await empleadoDe(req, req.body.idEmpleado);
        if (!e) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        const r = await db.transaccion(async (t) => {
            const c = await consentimientoVigente(req, e.idEmpleado, t);
            if (!c) return null;
            await db.empresa(req).query(`
                UPDATE empleados_consentimientos SET fechaRetiro = :ahora, idUsuarioRetiro = :uid, motivoRetiro = :motivo
                 WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado AND fechaRetiro IS NULL`,
            { replacements: { ahora: fechas.ahora(), uid: req.uid, motivo, idEmpleado: e.idEmpleado }, type: QueryTypes.UPDATE, transaction: t });
            const borrados = await faceid.eliminarRostro(req, e.idEmpleado, t);
            await registrar(req, { tipo: 'CONSENTIMIENTO_RETIRADO', idEmpleado: e.idEmpleado,
                descripcion: `${ e.nombreCompleto } retiró el consentimiento; rostro eliminado`, antes: { version: c.version }, despues: { motivo, rostroEliminado: borrados > 0 } }, t);
            return { borrados };
        });
        if (!r) return res.json({ status_code: 1, message: 'El empleado no tiene consentimiento vigente', data: null });
        return res.json({ status_code: 0, message: r.borrados ? 'Consentimiento retirado y rostro eliminado' : 'Consentimiento retirado', data: { id: e.idEmpleado } });
    } catch (error) {
        console.error('retirarConsentimiento', error);
        return res.json({ status_code: 2, message: 'No fue posible retirar el consentimiento', data: null });
    }
};

// ── Registro del rostro ──────────────────────────────────────────────────────

/** GET /api/faceid/getRetoRegistro — los giros de la captura del registro. */
const getRetoRegistro = async (req, res) => {
    try {
        const reto = faceReto.generar('REGISTRO', duenio(req));
        return res.json({ status_code: 0, message: 'Reto', data: {
            ...reto, tomas: await constantes.valor('faceid.tomas_registro', req)
        } });
    } catch (error) {
        console.error('getRetoRegistro', error);
        return res.json({ status_code: 2, message: 'No fue posible preparar la captura', data: null });
    }
};

/**
 * POST /api/faceid/registrarRostro
 *   { idEmpleado, idReto, frames }                 captura nueva
 *   { idEmpleado, tokenConfirmacion, confirmarParecido: true }   tras el aviso de parecido
 */
const registrarRostro = async (req, res) => {
    try {
        const e = await empleadoDe(req, req.body.idEmpleado);
        if (!e) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
        if (e.estado !== 'ACTIVO') return res.json({ status_code: 1, message: 'El empleado está dado de baja', data: null });
        if (!await consentimientoVigente(req, e.idEmpleado)) {
            return res.json({ status_code: 1, message: 'Primero registra el consentimiento del empleado', data: { codigo: 'SIN_CONSENTIMIENTO' } });
        }

        let captura;
        limpiarPendientes();
        if (req.body.tokenConfirmacion) {
            const p = pendientes.get(String(req.body.tokenConfirmacion));
            pendientes.delete(String(req.body.tokenConfirmacion));
            if (!p || p.duenio !== duenio(req) || p.idEmpleado !== e.idEmpleado) {
                return res.json({ status_code: 1, message: 'La captura venció. Vuelve a tomar el rostro.', data: null });
            }
            if (req.body.confirmarParecido !== true) return res.json({ status_code: 1, message: 'No se guardó el rostro', data: null });
            captura = p.captura;
        } else {
            const reto = faceReto.consumir(req.body.idReto, 'REGISTRO', duenio(req));
            if (!reto.ok) return res.json({ status_code: 1, message: reto.error, data: null });
            const sec = faceVida.validarSecuencia(req.body.frames);
            if (!sec.ok) return res.json({ status_code: 1, message: 'No se pudo ver bien el rostro. Intenta de nuevo.', data: null });
            const vida = faceVida.validarVida(sec, reto.pasos);
            if (!vida.ok) return res.json({ status_code: 1, message: 'No se completó la prueba de vida: sigue los giros que pide la pantalla.', data: { motivo: vida.motivo } });
            const tomasMin = await constantes.valor('faceid.tomas_registro', req);
            if (sec.descriptores.length < tomasMin) {
                return res.json({ status_code: 1, message: `Se necesitan ${ tomasMin } tomas del rostro; hubo ${ sec.descriptores.length }. Intenta de nuevo con más calma.`, data: null });
            }
            const cal = faceVida.revisarCalidad(sec, await constantes.valor('faceid.calidad_minima', req));
            if (!cal.ok) return res.json({ status_code: 1, message: cal.motivo, data: { calidad: cal.calidad } });
            captura = { tomas: sec.descriptores, promedio: faceVida.promedio(sec.descriptores), calidad: { ...cal.calidad, vida: vida.diagnostico } };

            const umbral = await constantes.valor('faceid.umbral', req);
            const parecidos = await faceid.parecidos(req, captura.promedio, e.idEmpleado, umbral);
            if (parecidos.length) {
                const token = crypto.randomUUID();
                pendientes.set(token, { duenio: duenio(req), idEmpleado: e.idEmpleado, captura, vence: Date.now() + MIN_CONFIRMAR * 60 * 1000 });
                return res.json({
                    status_code: 1,
                    message: `El rostro se parece al de ${ parecidos.map(p => `${ p.nombre } (${ p.numeroEmpleado })`).join(', ') }. Confirma que es ${ e.nombreCompleto } para guardarlo.`,
                    data: { codigo: 'PARECIDO', tokenConfirmacion: token,
                        parecidos: parecidos.map(p => ({ nombre: p.nombre, numeroEmpleado: p.numeroEmpleado, similitud: Math.round(Math.max(0, 1 - p.distancia) * 100) / 100 })) }
                });
            }
        }

        await db.transaccion(async (t) => {
            await faceid.guardarRostro(req, { idEmpleado: e.idEmpleado, tomas: captura.tomas, promedio: captura.promedio, calidad: captura.calidad }, t);
            await registrar(req, { tipo: 'ROSTRO_REGISTRADO', idEmpleado: e.idEmpleado,
                descripcion: `Rostro de ${ e.nombreCompleto } registrado (${ captura.tomas.length } tomas)${ req.body.tokenConfirmacion ? ' con aviso de parecido confirmado' : '' }`,
                despues: { tomas: captura.tomas.length, calidad: { ipd: captura.calidad.ipd, score: captura.calidad.score } } }, t);
        });
        return res.json({ status_code: 0, message: `Rostro de ${ e.nombreCompleto } registrado`, data: { id: e.idEmpleado } });
    } catch (error) {
        console.error('registrarRostro', error);
        return res.json({ status_code: 2, message: 'No fue posible registrar el rostro', data: null });
    }
};

module.exports = {
    getConsentimientoTexto, insertConsentimientoTexto, getRostroEmpleado, aceptarConsentimiento,
    retirarConsentimiento, getRetoRegistro, registrarRostro
};
