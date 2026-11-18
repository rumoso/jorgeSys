// =============================================================================
// Face ID en el servidor (análisis 005 §6, LP-5)
// =============================================================================
// El navegador calcula el descriptor (128 números); la COMPARACIÓN se hace
// solo aquí y los descriptores guardados nunca salen del servidor: ninguna
// función de este archivo los regresa a un controlador.
//
//   identificar(req, descriptor)  → { mejor, segundo, candidatos }
//       entre los empleados ACTIVOS, CON CONSENTIMIENTO VIGENTE y DE LA
//       EMPRESA de req (cualquier sucursal: el que cubre otra sucursal checa).
//   parecidos(req, descriptor, idEmpleado, umbral) → otros empleados de la
//       empresa por debajo del umbral (aviso al registrar).
//   guardarRostro / eliminarRostro.
//
// Caché: los descriptores de cada rostro registrado, por empresa e idRostro
// (un rostro nunca cambia: volver a registrar crea otro idRostro). QUIÉN
// participa (activo y con consentimiento) se consulta en cada búsqueda, así
// que una baja o un retiro aplican en la siguiente checada aunque nadie
// invalide la caché.
// =============================================================================

const { db, QueryTypes } = require('./db');
const { distancia, descriptorValido } = require('./faceVida');

const cache = new Map();   // `${idEmpresa}:${idRostro}` → promedio[]

// Distancia prácticamente cero = la plantilla guardada reenviada, no una cámara.
const DISTANCIA_MINIMA_CAPTURA = 0.02;

const nombreDe = (e) => [e.nombre, e.apellidoPaterno, e.apellidoMaterno].filter(Boolean).join(' ');

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Rostros que participan en la búsqueda, con su descriptor (de la caché o de la base). */
const participantes = async (req, excluir = null) => {
    const filas = await db.empresa(req).query(`
        SELECT r.idRostro, e.idEmpleado, e.numeroEmpleado, e.nombre, e.apellidoPaterno, e.apellidoMaterno,
               e.idSucursalPrincipal
          FROM empleados_rostros r
          JOIN empleados e ON e.idEmpresa = r.idEmpresa AND e.idEmpleado = r.idEmpleado
         WHERE r.idEmpresa = :idEmpresa AND e.estado = 'ACTIVO'
           AND (:excluir IS NULL OR e.idEmpleado <> :excluir)
           AND EXISTS (SELECT 1 FROM empleados_consentimientos c
                        WHERE c.idEmpresa = :idEmpresa AND c.idEmpleado = e.idEmpleado AND c.fechaRetiro IS NULL)`,
    { replacements: { excluir } });

    const faltan = filas.filter(f => !cache.has(`${ req.idEmpresa }:${ f.idRostro }`)).map(f => f.idRostro);
    if (faltan.length) {
        const ds = await db.empresa(req).query(
            'SELECT idRostro, descriptores FROM empleados_rostros WHERE idEmpresa = :idEmpresa AND idRostro IN (:faltan)',
            { replacements: { faltan } });
        for (const d of ds) cache.set(`${ req.idEmpresa }:${ d.idRostro }`, parse(d.descriptores).promedio);
    }
    return filas.map(f => ({
        idEmpleado: f.idEmpleado, numeroEmpleado: f.numeroEmpleado, nombre: nombreDe(f),
        idSucursalPrincipal: f.idSucursalPrincipal, descriptor: cache.get(`${ req.idEmpresa }:${ f.idRostro }`)
    })).filter(p => descriptorValido(p.descriptor));
};

const redondear = (n) => Math.round(n * 10000) / 10000;

/**
 * Los dos más parecidos: { mejor, segundo, total, plantilla }. Cada uno
 * { idEmpleado, numeroEmpleado, nombre, idSucursalPrincipal, distancia }
 * (sin descriptor). `plantilla`: la captura es idéntica a un rostro guardado.
 */
const identificar = async (req, descriptor) => {
    if (!descriptorValido(descriptor)) throw new Error('[faceid] descriptor inválido');
    const lista = (await participantes(req))
        .map(p => ({ ...p, distancia: distancia(descriptor, p.descriptor) }))
        .sort((a, b) => a.distancia - b.distancia);
    const limpio = (p) => (p ? {
        idEmpleado: p.idEmpleado, numeroEmpleado: p.numeroEmpleado, nombre: p.nombre,
        idSucursalPrincipal: p.idSucursalPrincipal, distancia: redondear(p.distancia)
    } : null);
    return {
        mejor: limpio(lista[0]),
        segundo: limpio(lista[1]),
        total: lista.length,
        plantilla: !!lista[0] && lista[0].distancia < DISTANCIA_MINIMA_CAPTURA
    };
};

/** Otros empleados de la empresa por debajo del umbral (sin descriptores). */
const parecidos = async (req, descriptor, idEmpleado, umbral) => (await participantes(req, idEmpleado))
    .map(p => ({ idEmpleado: p.idEmpleado, numeroEmpleado: p.numeroEmpleado, nombre: p.nombre, distancia: redondear(distancia(descriptor, p.descriptor)) }))
    .filter(p => p.distancia <= umbral)
    .sort((a, b) => a.distancia - b.distancia);

/** Reemplaza el rostro del empleado (uno vigente por empleado). Regresa el idRostro. */
const guardarRostro = async (req, { idEmpleado, tomas, promedio, calidad }, transaction) => {
    await eliminarRostro(req, idEmpleado, transaction);
    const [idRostro] = await db.empresa(req).query(`
        INSERT INTO empleados_rostros (idEmpresa, idEmpleado, descriptores, tomas, calidad, idUsuarioRegistro, fechaRegistro)
        VALUES (:idEmpresa, :idEmpleado, :descriptores, :tomas, :calidad, :uid, :fecha)`, {
        replacements: {
            idEmpleado, descriptores: JSON.stringify({ promedio, tomas }), tomas: tomas.length,
            calidad: calidad ? JSON.stringify(calidad) : null, uid: req.uid ?? null, fecha: new Date().toISOString().replace('T', ' ').replace('Z', '')
        },
        type: QueryTypes.INSERT,
        transaction
    });
    return idRostro;
};

/** Elimina el rostro registrado (retiro del consentimiento o reemplazo). Regresa cuántos borró. */
const eliminarRostro = async (req, idEmpleado, transaction) => {
    const previos = await db.empresa(req).query(
        'SELECT idRostro FROM empleados_rostros WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado',
        { replacements: { idEmpleado }, transaction });
    if (!previos.length) return 0;
    await db.empresa(req).query(
        'DELETE FROM empleados_rostros WHERE idEmpresa = :idEmpresa AND idEmpleado = :idEmpleado',
        { replacements: { idEmpleado }, type: QueryTypes.DELETE, transaction });
    for (const p of previos) cache.delete(`${ req.idEmpresa }:${ p.idRostro }`);
    return previos.length;
};

/** Vacía la caché de una empresa (o toda). */
const invalidar = (idEmpresa = null) => {
    if (!idEmpresa) return cache.clear();
    for (const k of cache.keys()) if (k.startsWith(`${ idEmpresa }:`)) cache.delete(k);
};

module.exports = { identificar, parecidos, guardarRostro, eliminarRostro, invalidar, DISTANCIA_MINIMA_CAPTURA };
