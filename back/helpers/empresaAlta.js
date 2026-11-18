// Lo que toda empresa nueva necesita (análisis 002 y 003): sus módulos
// disponibles, sus roles copiados de las plantillas y su configuración con
// los valores iniciales. La lógica vive en el procedimiento
// sp_preparar_empresa (SQL/002), que también usó la migración, para que no
// haya dos versiones de la misma regla.
const { db, QueryTypes } = require('./db');

/** Prepara la empresa y regresa el id de su rol Administrador. */
const prepararEmpresa = async (idEmpresa, transaction) => {
    await db.sinEmpresa.query(
        'CALL sp_preparar_empresa(:idEmpresa) /* sin-empresa: alta de empresa, todavía sin sesión de esa empresa */',
        { replacements: { idEmpresa }, type: QueryTypes.RAW, transaction });
    // Configuración con sus valores iniciales, sin confirmar (análisis 003).
    await db.sinEmpresa.query(
        'CALL sp_preparar_configuracion(:idEmpresa) /* sin-empresa: alta de empresa, todavía sin sesión de esa empresa */',
        { replacements: { idEmpresa }, type: QueryTypes.RAW, transaction });
    // Checador (análisis 005): texto de consentimiento y forma de sus sucursales.
    await prepararChecador(idEmpresa, transaction);
    const [rol] = await db.empresa({ idEmpresa }).query(`
        SELECT idRol FROM roles WHERE idEmpresa = :idEmpresa AND plantilla = 'ADMINISTRADOR'`, { transaction });
    return rol.idRol;
};

/**
 * Checador (análisis 005): toda sucursal arranca con el dispositivo checador
 * permitido y toda empresa con su texto de consentimiento. La regla vive en
 * sp_preparar_checador (SQL/005); se llama al dar de alta una empresa o una
 * sucursal. Repetible.
 */
async function prepararChecador(idEmpresa, transaction) {
    await db.sinEmpresa.query(
        'CALL sp_preparar_checador(:idEmpresa) /* sin-empresa: alta de empresa o sucursal; el procedimiento filtra por esa empresa */',
        { replacements: { idEmpresa }, type: QueryTypes.RAW, transaction });
}

/** Id del rol de una plantilla en la empresa (o undefined). */
const rolDePlantilla = async (idEmpresa, plantilla, transaction) => {
    const [rol] = await db.empresa({ idEmpresa }).query(`
        SELECT idRol FROM roles WHERE idEmpresa = :idEmpresa AND plantilla = :plantilla`,
    { replacements: { plantilla }, transaction });
    return rol?.idRol;
};

// =============================================================================
// Alta de empresa en un paso (análisis 009, T15)
// =============================================================================
// UNA sola alta: la usan el panel (controllers/panel/empresas.js →
// insertEmpresa) y scripts/instalar.js. Toda empresa creada queda con su plan
// y su renglón ALTA en el historial. Corre dentro de la transacción de quien
// la llama; la bitácora del producto la escribe quien llama (panel o script).
//
//   altaEmpresa({ nombreComercial, razonSocial, rfc, sucursal, zonaHoraria,
//                 correoAdmin, nombreAdmin, password?, modulos?, idPlan,
//                 precioEspecial?, idSuperadmin?, detalle? }, t)
//   → { idEmpresa, idSucursal, idUsuario, cuentaCreada, passwordProvisional }
//
// Cuenta del administrador: si el correo ya existe, solo se le da acceso. Si
// no, se crea; sin `password` (el panel) se genera una contraseña
// PROVISIONAL que se regresa una sola vez y nunca se guarda en claro.
// `idPlan` llega ya validado por quien llama (cat_planes es del panel).
// =============================================================================

const crypto = require('crypto');
const { normalizarCorreo, correoValido, hashPassword, passwordValido, PASSWORD_MIN } = require('./sesion');
const { Regla } = require('./permisosEdicion');
const constantes = require('./constantes');
const { hoy } = require('./fechas');

const RE_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const limpio = (v) => {
    const s = String(v ?? '').trim().replace(/\s+/g, ' ');
    return s || null;
};

/** Nombre comercial, razón social y RFC normalizados; si algo no sirve, lanza Regla. */
const validarDatosEmpresa = ({ nombreComercial, razonSocial, rfc }) => {
    const d = {
        nombreComercial: limpio(nombreComercial),
        razonSocial: limpio(razonSocial),
        rfc: limpio(rfc)?.toUpperCase().replace(/\s+/g, '') || null
    };
    if (!d.nombreComercial) throw new Regla('Escribe el nombre comercial');
    if (d.nombreComercial.length > 150) throw new Regla('El nombre comercial admite hasta 150 caracteres');
    if (d.razonSocial && d.razonSocial.length > 250) throw new Regla('La razón social admite hasta 250 caracteres');
    if (d.rfc && !RE_RFC.test(d.rfc)) throw new Regla('El RFC no tiene un formato válido');
    return d;
};

// Sin caracteres que se confunden al dictarla (0/O, 1/l/I).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const LARGO_PROVISIONAL = Math.max(12, PASSWORD_MIN);

/** Contraseña provisional aleatoria que cumple las reglas de helpers/sesion.js. */
const passwordProvisional = () => {
    let s = '';
    for (let i = 0; i < LARGO_PROVISIONAL; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
    if (!passwordValido(s)) throw new Error('[empresaAlta] La contraseña provisional no cumple las reglas');
    return s;
};

/** Inserta la empresa y la prepara (módulos, roles, configuración y checador). → { idEmpresa, idRolAdmin } */
const crearEmpresa = async ({ nombreComercial, razonSocial = null, rfc = null, estado = 'ACTIVA' }, transaction) => {
    const [idEmpresa] = await db.sinEmpresa.query(`
        INSERT INTO empresas (nombreComercial, razonSocial, rfc, estado)
        VALUES (:nombreComercial, :razonSocial, :rfc, :estado)
        /* sin-empresa: alta de empresa; su id todavía no existe */`,
    { replacements: { nombreComercial, razonSocial, rfc, estado }, type: QueryTypes.INSERT, transaction });
    const idRolAdmin = await prepararEmpresa(idEmpresa, transaction);
    return { idEmpresa, idRolAdmin };
};

/** Sucursal de la empresa con su zona horaria (y su checador, 005). → idSucursal */
const crearSucursal = async (idEmpresa, nombre, zonaHoraria, transaction) => {
    const n = limpio(nombre);
    if (!n) throw new Regla('Escribe el nombre de la primera sucursal');
    if (n.length > 100) throw new Regla('El nombre de la sucursal admite hasta 100 caracteres');
    const [zona] = await db.global.query('SELECT zona FROM cat_zonas_horarias WHERE zona = :zona',
        { replacements: { zona: String(zonaHoraria || '') }, transaction });
    if (!zona) throw new Regla(`La zona horaria "${ zonaHoraria || '' }" no está en el catálogo`);
    const [idSucursal] = await db.empresa({ idEmpresa }).query(`
        INSERT INTO sucursales (idEmpresa, nombre, zonaHoraria) VALUES (:idEmpresa, :nombre, :zona)`,
    { replacements: { nombre: n, zona: zona.zona }, type: QueryTypes.INSERT, transaction });
    await prepararChecador(idEmpresa, transaction);
    return idSucursal;
};

/**
 * Módulos contratados (002): exactamente `modulos` (solo los DISPONIBLES que
 * no son "siempre"). No toca roles ni permisos: quitar un módulo solo oculta
 * sus menús. → { antes: [...], despues: [...] }
 */
const guardarModulos = async (idEmpresa, modulos, transaction) => {
    if (!Array.isArray(modulos)) throw new Regla('Los módulos deben ser una lista');
    const pedidos = [...new Set(modulos.map(m => String(m || '').trim().toUpperCase()).filter(Boolean))];
    const validos = (await db.global.query(
        "SELECT modulo FROM cat_modulos WHERE estado = 'DISPONIBLE' AND bSiempre = 0", { transaction })).map(x => x.modulo);
    const malos = pedidos.filter(m => !validos.includes(m));
    if (malos.length) throw new Regla(`Módulo(s) que no se pueden contratar: ${ malos.join(', ') }`);
    const q = db.empresa({ idEmpresa });
    const antes = (await q.query('SELECT modulo FROM empresas_modulos WHERE idEmpresa = :idEmpresa ORDER BY modulo',
        { transaction })).map(x => x.modulo);
    const quitar = antes.filter(m => !pedidos.includes(m));
    const agregar = pedidos.filter(m => !antes.includes(m));
    if (quitar.length) {
        await q.query('DELETE FROM empresas_modulos WHERE idEmpresa = :idEmpresa AND modulo IN (:quitar)',
            { replacements: { quitar }, type: QueryTypes.DELETE, transaction });
    }
    for (const modulo of agregar) {
        await q.query('INSERT INTO empresas_modulos (idEmpresa, modulo) VALUES (:idEmpresa, :modulo)',
            { replacements: { modulo }, type: QueryTypes.INSERT, transaction });
    }
    return { antes, despues: [...pedidos].sort(), cambio: quitar.length + agregar.length > 0 };
};

/**
 * El administrador de la empresa nueva, con el rol Administrador y todas las
 * sucursales. → { idUsuario, nombre, cuentaCreada, passwordProvisional }
 */
const darAccesoAdministrador = async (idEmpresa, idRolAdmin, { correoAdmin, nombreAdmin, password = null }, transaction) => {
    const correo = normalizarCorreo(correoAdmin);
    if (!correoValido(correo)) throw new Regla('Escribe un correo válido para el administrador');
    let [cuenta] = await db.global.query('SELECT idUsuario, nombre, bActivo FROM usuarios WHERE correo = :correo',
        { replacements: { correo }, transaction });
    let cuentaCreada = false;
    let provisional = null;
    if (cuenta && !cuenta.bActivo) throw new Regla('La cuenta de ese correo está desactivada en el sistema');
    if (!cuenta) {
        const nombre = limpio(nombreAdmin);
        if (!nombre) throw new Regla('No hay una cuenta con ese correo: escribe el nombre del administrador para crearla', { requiereNombre: true });
        if (nombre.length > 150) throw new Regla('El nombre del administrador admite hasta 150 caracteres');
        if (password !== null && !passwordValido(password)) throw new Regla(`La contraseña debe tener al menos ${ PASSWORD_MIN } caracteres`);
        if (password === null) provisional = passwordProvisional();
        const [idUsuario] = await db.global.query(`
            INSERT INTO usuarios (correo, passwordHash, nombre) VALUES (:correo, :hash, :nombre)`,
        { replacements: { correo, hash: hashPassword(password ?? provisional), nombre }, type: QueryTypes.INSERT, transaction });
        cuenta = { idUsuario, nombre };
        cuentaCreada = true;
    }
    const q = db.empresa({ idEmpresa });
    await q.query('INSERT INTO usuarios_empresa (idEmpresa, idUsuario, bTodasSucursales) VALUES (:idEmpresa, :idUsuario, 1)',
        { replacements: { idUsuario: cuenta.idUsuario }, type: QueryTypes.INSERT, transaction });
    await q.query('INSERT INTO usuarios_empresa_roles (idEmpresa, idUsuario, idRol) VALUES (:idEmpresa, :idUsuario, :idRol)',
        { replacements: { idUsuario: cuenta.idUsuario, idRol: idRolAdmin }, type: QueryTypes.INSERT, transaction });
    return { idUsuario: cuenta.idUsuario, nombre: cuenta.nombre, correo, cuentaCreada, passwordProvisional: provisional };
};

/** Día de hoy del producto (`producto.zona_horaria`): inicio de planes, conteo y cobro. */
const hoyProducto = async () => hoy(await constantes.valor('producto.zona_horaria'));

/** Plan inicial y renglón ALTA del historial. */
const registrarAlta = async (idEmpresa, { idPlan, fechaInicio = null, precioEspecial = null, idSuperadmin = null, detalle = null }, transaction) => {
    if (!idPlan) throw new Regla('Escoge el plan de la empresa');
    const q = db.empresa({ idEmpresa });
    await q.query(`
        INSERT INTO empresas_planes (idEmpresa, idPlan, fechaInicio, precioEspecial, idSuperadmin)
        VALUES (:idEmpresa, :idPlan, :fechaInicio, :precioEspecial, :idSuperadmin)`,
    { replacements: { idPlan, fechaInicio: fechaInicio || await hoyProducto(), precioEspecial, idSuperadmin },
        type: QueryTypes.INSERT, transaction });
    await q.query(`
        INSERT INTO empresas_historial (idEmpresa, tipo, detalle, idSuperadmin)
        VALUES (:idEmpresa, 'ALTA', :detalle, :idSuperadmin)`,
    { replacements: { detalle: detalle ? String(detalle).slice(0, 1000) : null, idSuperadmin }, type: QueryTypes.INSERT, transaction });
};

/** La alta completa en un paso (ver arriba). */
const altaEmpresa = async (d, transaction) => {
    const datos = validarDatosEmpresa(d);
    if (d.precioEspecial !== null && d.precioEspecial !== undefined
        && !(Number.isFinite(Number(d.precioEspecial)) && Number(d.precioEspecial) >= 0)) {
        throw new Regla('El precio especial debe ser un número mayor o igual a 0');
    }
    const { idEmpresa, idRolAdmin } = await crearEmpresa(datos, transaction);
    if (Array.isArray(d.modulos)) await guardarModulos(idEmpresa, d.modulos, transaction);
    const idSucursal = await crearSucursal(idEmpresa, d.sucursal, d.zonaHoraria, transaction);
    const admin = await darAccesoAdministrador(idEmpresa, idRolAdmin, d, transaction);
    await registrarAlta(idEmpresa, {
        idPlan: d.idPlan,
        fechaInicio: d.fechaInicio || null,
        precioEspecial: d.precioEspecial === null || d.precioEspecial === undefined || d.precioEspecial === '' ? null : Number(d.precioEspecial),
        idSuperadmin: d.idSuperadmin || null,
        detalle: d.detalle || `Alta con la sucursal ${ limpio(d.sucursal) } y el administrador ${ admin.correo }${ admin.cuentaCreada ? ' (cuenta nueva)' : ' (cuenta existente)' }`
    }, transaction);
    return {
        idEmpresa, idSucursal, idUsuario: admin.idUsuario, nombreAdmin: admin.nombre, correoAdmin: admin.correo,
        cuentaCreada: admin.cuentaCreada, passwordProvisional: admin.passwordProvisional, ...datos
    };
};

module.exports = {
    prepararEmpresa, rolDePlantilla, prepararChecador,
    validarDatosEmpresa, passwordProvisional, crearEmpresa, crearSucursal, guardarModulos,
    darAccesoAdministrador, registrarAlta, altaEmpresa, hoyProducto
};
