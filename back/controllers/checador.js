// =============================================================================
// El dispositivo checador (análisis 005 §5 y §7): endpoints SIN sesión.
// =============================================================================
// - vincular: con el código de un solo uso, sin llave.
// - latido, getReto, checar, checarConNumero: con la llave del dispositivo
//   (middlewares/validar-dispositivo.js). La empresa y la sucursal salen de
//   la llave; nada de lo que mande el navegador las cambia.
//
// Este archivo es el ADAPTADOR de la forma 'dispositivo': identifica con
// Face ID, arma la solicitud y llama a helpers/marcaje.js. No escribe
// marcajes por su cuenta (LP-6).
//
// Respuesta de checar: `data.resultado` =
//   REGISTRADO | POR_REVISAR          (status_code 0: hay marcaje)
//   DUDA                              (status_code 0: pide el número, con `folio`)
//   NO_RECONOCIDO | SIN_VIDA | RECHAZADO | REINTENTAR   (status_code 1: sin marcaje)
// =============================================================================

const { db, QueryTypes } = require('../helpers/db');
const fechas = require('../helpers/fechas');
const constantes = require('../helpers/constantes');
const { hash, normalizarCodigo, codigoConForma, generarLlave } = require('../helpers/llaves');
const { registrar } = require('../helpers/bitacoraChecador');
const { registrarMarcaje, registrarIntento, instanteSQL } = require('../helpers/marcaje');
const faceid = require('../helpers/faceid');
const faceVida = require('../helpers/faceVida');
const faceReto = require('../helpers/faceReto');
const evidencias = require('../helpers/evidencias');

const FORMA = 'dispositivo';
const MIN_VIGENCIA_FOLIO = 3;           // minutos para confirmar con el número
const MIN_VENTANA_FALLOS = 5;           // fallos que cuentan para checar con número

const duenio = (req) => `d:${ req.idEmpresa }:${ req.idDispositivo }`;

const fallo = (res, message, data = null) => {
    res.locals.intentoFallido = true;
    return res.json({ status_code: 1, message, data });
};

// ── Vincular ─────────────────────────────────────────────────────────────────

/** POST /api/checador/vincular { codigo } → { llave, dispositivo } (la llave, una sola vez). */
const vincular = async (req, res) => {
    const codigo = normalizarCodigo(req.body.codigo);
    try {
        if (!codigoConForma(codigo)) return fallo(res, 'El código no es válido. Revisa que esté bien escrito.', { codigo: 'CODIGO_INVALIDO' });
        const [d] = await db.sinEmpresa.query(`
            SELECT d.idDispositivo, d.idEmpresa, d.idSucursal, d.nombre, d.estado, (d.codigoVence > :ahora) AS bVigente,
                   s.nombre AS sucursal, s.bActivo AS sucursalActiva, s.zonaHoraria,
                   e.nombreComercial AS empresa, e.estado AS estadoEmpresa
              FROM dispositivos d
              JOIN sucursales s ON s.idEmpresa = d.idEmpresa AND s.idSucursal = d.idSucursal
              JOIN empresas e ON e.idEmpresa = d.idEmpresa
             WHERE d.codigoHash = :codigoHash
             /* sin-empresa: el código de vinculación es el que dice de qué empresa y sucursal es el dispositivo */`,
        { replacements: { codigoHash: hash(codigo), ahora: fechas.ahora() } });

        if (!d) return fallo(res, 'El código no existe. Revisa que esté bien escrito o pide uno nuevo.', { codigo: 'CODIGO_INVALIDO' });
        if (d.estado !== 'PENDIENTE') return fallo(res, 'Ese código ya se usó. Pide al administrador uno nuevo.', { codigo: 'CODIGO_USADO' });
        if (!Number(d.bVigente)) {
            return fallo(res, 'El código venció. Pide al administrador que genere otro.', { codigo: 'CODIGO_VENCIDO' });
        }
        if (d.estadoEmpresa !== 'ACTIVA' || !d.sucursalActiva) {
            return fallo(res, 'La sucursal de este código está inactiva.', { codigo: 'SUCURSAL_INACTIVA' });
        }

        const ahora = fechas.ahora();
        const llave = generarLlave();
        const reqEmpresa = { idEmpresa: Number(d.idEmpresa) };
        const vinculado = await db.transaccion(async (t) => {
            const [, filas] = await db.empresa(reqEmpresa).query(`
                UPDATE dispositivos
                   SET estado = 'VINCULADO', llaveHash = :llaveHash, codigoVence = NULL,
                       fechaVinculacion = :ahora, ultimaConexion = :ahora
                 WHERE idEmpresa = :idEmpresa AND idDispositivo = :idDispositivo AND estado = 'PENDIENTE'`,
            { replacements: { llaveHash: hash(llave), ahora, idDispositivo: d.idDispositivo }, type: QueryTypes.UPDATE, transaction: t });
            if (!filas) return false;
            await registrar(reqEmpresa, { tipo: 'DISPOSITIVO_VINCULADO', idSucursal: d.idSucursal, idDispositivo: d.idDispositivo,
                descripcion: `Dispositivo "${ d.nombre }" vinculado`, despues: { ip: req.ip, agente: String(req.get('user-agent') || '').slice(0, 150) } }, t);
            return true;
        });
        if (!vinculado) return fallo(res, 'Ese código ya se usó. Pide al administrador uno nuevo.', { codigo: 'CODIGO_USADO' });

        return res.json({
            status_code: 0,
            message: `Dispositivo vinculado a ${ d.sucursal }`,
            data: { llave, dispositivo: { nombre: d.nombre, sucursal: d.sucursal, empresa: d.empresa, zonaHoraria: d.zonaHoraria } }
        });
    } catch (error) {
        console.error('vincular', error);
        return res.json({ status_code: 2, message: 'No fue posible vincular el dispositivo', data: null });
    }
};

// ── Con la llave ─────────────────────────────────────────────────────────────

/** POST /api/checador/latido { version } — "sigo encendido"; regresa lo que necesita la pantalla. */
const latido = async (req, res) => {
    try {
        const version = req.body?.version ? String(req.body.version).slice(0, 30) : null;
        await db.empresa(req).query(`
            UPDATE dispositivos SET ultimaConexion = :ahora, versionFront = COALESCE(:version, versionFront)
             WHERE idEmpresa = :idEmpresa AND idDispositivo = :idDispositivo`,
        { replacements: { ahora: fechas.ahora(), version, idDispositivo: req.idDispositivo }, type: QueryTypes.UPDATE });
        return res.json({
            status_code: 0,
            message: 'En línea',
            data: {
                dispositivo: req.dispositivo,
                versionFront: process.env.FRONT_VERSION || null,
                parametros: {
                    latidoSeg: await constantes.valor('checador.latido_seg', req),
                    antirreboteSeg: await constantes.valor('checador.antirrebote_seg', req),
                    intentosAntesDeNumero: await constantes.valor('checador.intentos_antes_de_numero', req)
                }
            }
        });
    } catch (error) {
        console.error('latido', error);
        return res.json({ status_code: 2, message: 'No fue posible avisar al servidor', data: null });
    }
};

/** GET /api/checador/getReto — los giros de cabeza de la siguiente captura. */
const getReto = (req, res) => res.json({ status_code: 0, message: 'Reto', data: faceReto.generar('CHECADOR', duenio(req)) });

/** Lee y valida la captura con prueba de vida. { ok, descriptor, diagnostico } o { ok: false, respuesta }. */
const leerCaptura = async (req, res) => {
    const datos = req.datos || {};
    const reto = faceReto.consumir(datos.idReto, 'CHECADOR', duenio(req));
    if (!reto.ok) return { ok: false, respuesta: () => res.json({ status_code: 1, message: reto.error, data: { resultado: 'REINTENTAR' } }) };
    const sec = faceVida.validarSecuencia(datos.frames);
    if (!sec.ok) return { ok: false, respuesta: () => fallo(res, 'No se pudo ver bien tu rostro. Intenta de nuevo.', { resultado: 'REINTENTAR' }) };
    const vida = faceVida.validarVida(sec, reto.pasos);
    if (!vida.ok) {
        await registrarIntento(req, { idSucursal: req.idSucursal, idDispositivo: req.idDispositivo, forma: FORMA,
            motivo: 'SIN_VIDA', detalle: vida.motivo, datos: { diagnostico: vida.diagnostico } });
        return { ok: false, respuesta: () => fallo(res, 'No pude confirmar que estás frente a la cámara. Sigue las instrucciones e intenta de nuevo.', { resultado: 'SIN_VIDA' }) };
    }
    return { ok: true, descriptor: faceVida.promedio(sec.descriptores), diagnostico: vida.diagnostico };
};

/** Respuesta de un marcaje creado o rechazado por el proceso. */
const responderMarcaje = (res, r) => {
    if (!r.ok) {
        const message = r.motivo === 'VERIFICACION_ANTIRREBOTE' ? `${ r.empleado?.nombre || 'Ya' }: ya quedaste registrado hace un momento.` : r.mensaje;
        return res.json({ status_code: 1, message, data: { resultado: 'RECHAZADO', motivo: r.motivo, nombre: r.empleado?.nombre || null } });
    }
    const local = fechas.aLocal(r.instante, r.zona);
    const porRevisar = r.resultado === 'POR_REVISAR';
    return res.json({
        status_code: 0,
        message: porRevisar ? `${ r.empleado.nombre }: registrado; lo revisará tu encargado` : `${ r.empleado.nombre }: registrado`,
        data: { resultado: porRevisar ? 'POR_REVISAR' : 'REGISTRADO', nombre: r.empleado.nombre, numeroEmpleado: r.empleado.numeroEmpleado,
            hora: local.hora, fecha: r.fechaNegocio, idMarcaje: r.idMarcaje }
    });
};

/** Guarda la foto, llama al proceso y, si se rechaza, borra la foto. */
const marcar = async (req, { idEmpleado, evidencias: ev }) => {
    const archivo = await evidencias.guardarFoto(req.idEmpresa, req.file.buffer);
    const dias = await constantes.valor('evidencia.dias_foto', req);
    const vence = new Date(fechas.ahora().getTime() + dias * 24 * 60 * 60 * 1000);
    const r = await registrarMarcaje(req, {
        idSucursal: req.idSucursal, idEmpleado, forma: FORMA, idDispositivo: req.idDispositivo,
        evidencias: [
            { tipo: 'foto', archivo, vence, dato: { dias } },
            { tipo: 'dispositivo', dato: { idDispositivo: req.idDispositivo, nombre: req.dispositivo.nombre } },
            ...ev
        ]
    });
    if (!r.ok) await evidencias.borrarFoto(archivo);
    return r;
};

const fotoValida = (req) => !!req.file && !!evidencias.tipoFoto(req.file.buffer);

/** POST /api/checador/checar (multipart: foto + datos { idReto, frames }) */
const checar = async (req, res) => {
    try {
        if (!fotoValida(req)) return res.json({ status_code: 1, message: 'Falta la foto del momento. Intenta de nuevo.', data: { resultado: 'REINTENTAR' } });
        const cap = await leerCaptura(req, res);
        if (!cap.ok) return cap.respuesta();

        const umbral = await constantes.valor('faceid.umbral', req);
        const margen = await constantes.valor('faceid.margen_duda', req);
        const id = await faceid.identificar(req, cap.descriptor);
        const medida = {
            mejor: id.mejor && { idEmpleado: id.mejor.idEmpleado, distancia: id.mejor.distancia },
            segundo: id.segundo && { idEmpleado: id.segundo.idEmpleado, distancia: id.segundo.distancia },
            participantes: id.total, umbral, margen, vida: cap.diagnostico
        };
        const base = { idSucursal: req.idSucursal, idDispositivo: req.idDispositivo, forma: FORMA };

        if (id.plantilla) {
            await registrarIntento(req, { ...base, motivo: 'PLANTILLA', detalle: 'La captura es idéntica a un rostro guardado', datos: medida });
            return fallo(res, 'No te reconocí, intenta de nuevo.', { resultado: 'NO_RECONOCIDO' });
        }
        if (!id.mejor || id.mejor.distancia > umbral) {
            await registrarIntento(req, { ...base, motivo: 'NO_RECONOCIDO', detalle: 'Nadie pasó el umbral', datos: medida });
            return fallo(res, 'No te reconocí, intenta de nuevo.', {
                resultado: 'NO_RECONOCIDO', intentosAntesDeNumero: await constantes.valor('checador.intentos_antes_de_numero', req)
            });
        }
        if (id.segundo && id.segundo.distancia - id.mejor.distancia < margen) {
            const folio = require('crypto').randomUUID();
            await registrarIntento(req, { ...base, motivo: 'DUDA_ENTRE_DOS', folio,
                detalle: 'Los dos más parecidos quedaron dentro del margen de duda',
                datos: { ...medida, candidatos: [id.mejor, id.segundo].map(c => ({ idEmpleado: c.idEmpleado, distancia: c.distancia })) } });
            return res.json({ status_code: 0, message: 'Confirma con tu número de empleado', data: { resultado: 'DUDA', folio } });
        }

        const r = await marcar(req, {
            idEmpleado: id.mejor.idEmpleado,
            evidencias: [{ tipo: 'faceid', dato: { resultado: 'IDENTIFICADO', distancia: id.mejor.distancia,
                similitud: Math.round(Math.max(0, 1 - id.mejor.distancia) * 100) / 100,
                segundo: medida.segundo, umbral, margen, vida: cap.diagnostico } }]
        });
        return responderMarcaje(res, r);
    } catch (error) {
        console.error('checar', error);
        return res.json({ status_code: 2, message: 'No fue posible registrar. Intenta de nuevo.', data: { resultado: 'REINTENTAR' } });
    }
};

/**
 * POST /api/checador/checarConNumero (multipart: foto + datos { numeroEmpleado, folio? })
 *  - con folio (duda entre dos): si el número es de uno de los dos, ACEPTADO;
 *    si es de otro, POR_REVISAR;
 *  - sin folio (tras `checador.intentos_antes_de_numero` intentos sin
 *    reconocer en este dispositivo): siempre POR_REVISAR, con la foto.
 */
const checarConNumero = async (req, res) => {
    try {
        if (!fotoValida(req)) return res.json({ status_code: 1, message: 'Falta la foto del momento. Intenta de nuevo.', data: { resultado: 'REINTENTAR' } });
        const numero = String(req.datos?.numeroEmpleado || '').trim().toUpperCase();
        const folio = req.datos?.folio ? String(req.datos.folio) : null;
        if (!numero || numero.length > 20) return fallo(res, 'Escribe tu número de empleado', { resultado: 'REINTENTAR' });

        const [emp] = await db.empresa(req).query(
            "SELECT idEmpleado FROM empleados WHERE idEmpresa = :idEmpresa AND UPPER(numeroEmpleado) = :numero AND estado = 'ACTIVO'",
            { replacements: { numero } });
        if (!emp) return fallo(res, 'Ese número de empleado no existe. Revísalo e intenta de nuevo.', { resultado: 'REINTENTAR' });

        const ahora = fechas.ahora();
        let faceidDato;
        if (folio) {
            const [intento] = await db.empresa(req).query(`
                SELECT idIntento, datos FROM marcajes_intentos
                 WHERE idEmpresa = :idEmpresa AND folio = :folio AND idDispositivo = :idDispositivo
                   AND motivo = 'DUDA_ENTRE_DOS' AND fechaUsoFolio IS NULL AND instante > :desde`,
            { replacements: { folio, idDispositivo: req.idDispositivo, desde: instanteSQL(new Date(ahora.getTime() - MIN_VIGENCIA_FOLIO * 60 * 1000)) } });
            if (!intento) return fallo(res, 'La confirmación venció. Vuelve a checar con tu rostro.', { resultado: 'REINTENTAR' });
            const [, usados] = await db.empresa(req).query(`
                UPDATE marcajes_intentos SET fechaUsoFolio = :ahora
                 WHERE idEmpresa = :idEmpresa AND idIntento = :idIntento AND fechaUsoFolio IS NULL`,
            { replacements: { ahora, idIntento: intento.idIntento }, type: QueryTypes.UPDATE });
            if (!usados) return fallo(res, 'La confirmación ya se usó. Vuelve a checar con tu rostro.', { resultado: 'REINTENTAR' });
            const datos = typeof intento.datos === 'string' ? JSON.parse(intento.datos) : intento.datos;
            const candidato = (datos?.candidatos || []).find(c => Number(c.idEmpleado) === Number(emp.idEmpleado));
            faceidDato = candidato
                ? { resultado: 'CONFIRMADO_CON_NUMERO', distancia: candidato.distancia, candidatos: datos.candidatos, umbral: datos.umbral, margen: datos.margen }
                : { resultado: 'DUDA_NO_RESUELTA', candidatos: datos?.candidatos || [], umbral: datos?.umbral, margen: datos?.margen };
        } else {
            const minimo = await constantes.valor('checador.intentos_antes_de_numero', req);
            // Cuentan los fallos desde el último marcaje de este dispositivo (con milisegundos).
            const [d] = await db.empresa(req).query(
                'SELECT MAX(instante) AS ultimo FROM marcajes WHERE idEmpresa = :idEmpresa AND idDispositivo = :idDispositivo',
                { replacements: { idDispositivo: req.idDispositivo } });
            let desde = new Date(ahora.getTime() - MIN_VENTANA_FALLOS * 60 * 1000);
            if (d?.ultimo) {
                const ultimo = new Date(fechas.aLocal(d.ultimo, 'UTC').instante);
                if (ultimo > desde) desde = ultimo;
            }
            const [n] = await db.empresa(req).query(`
                SELECT COUNT(*) AS n FROM marcajes_intentos
                 WHERE idEmpresa = :idEmpresa AND idDispositivo = :idDispositivo
                   AND motivo IN ('NO_RECONOCIDO', 'SIN_VIDA', 'PLANTILLA') AND instante > :desde`,
            { replacements: { idDispositivo: req.idDispositivo, desde: instanteSQL(desde) } });
            if (Number(n.n) < minimo) {
                return fallo(res, 'Primero intenta checar con tu rostro.', { resultado: 'REINTENTAR' });
            }
            faceidDato = { resultado: 'SOLO_NUMERO', intentos: Number(n.n) };
        }

        const r = await marcar(req, {
            idEmpleado: emp.idEmpleado,
            evidencias: [
                { tipo: 'faceid', dato: faceidDato },
                { tipo: 'numero_empleado', dato: { numero, folio } }
            ]
        });
        return responderMarcaje(res, r);
    } catch (error) {
        console.error('checarConNumero', error);
        return res.json({ status_code: 2, message: 'No fue posible registrar. Intenta de nuevo.', data: { resultado: 'REINTENTAR' } });
    }
};

module.exports = { vincular, latido, getReto, checar, checarConNumero };
