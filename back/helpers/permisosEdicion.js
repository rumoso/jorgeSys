// Reglas compartidas para editar permisos (de un rol o directos de un
// usuario), análisis 002.
const { db } = require('./db');
const { modulosDe, todoLoContratado } = require('./userActions');

/** Error de regla de negocio: el controlador responde status_code 1 con su mensaje. */
class Regla extends Error {
    constructor(message, data = null) { super(message); this.data = data; }
}

/** Etiquetas legibles para los mensajes. */
const etiquetas = async (menus, acciones) => {
    const out = [];
    if (menus.length) {
        out.push(...(await db.global.query('SELECT titulo FROM cat_menus WHERE menu IN (:menus)',
            { replacements: { menus } })).map(x => `menú ${ x.titulo }`));
    }
    if (acciones.length) {
        out.push(...(await db.global.query('SELECT etiqueta FROM cat_acciones WHERE accion IN (:acciones)',
            { replacements: { acciones } })).map(x => x.etiqueta));
    }
    return out.join(', ');
};

/**
 * Calcula los permisos marcados que quedarán, a partir de lo pedido:
 *  - solo claves del catálogo y de módulos contratados (el resto, error);
 *  - los menús del módulo General no se guardan (los tiene todo usuario);
 *  - marcar una acción marca su menú;
 *  - SIN ESCALADA: agregar o quitar algo que el otorgante no tiene es error.
 */
const prepararCambio = async (req, actual, pedido, otorgante) => {
    const modulos = await modulosDe(req);
    const contratado = await todoLoContratado(modulos);
    const siempre = new Set((await db.global.query(`
        SELECT cm.menu FROM cat_menus cm JOIN cat_modulos mo ON mo.modulo = cm.modulo WHERE mo.bSiempre = 1`))
        .map(x => x.menu));

    const acciones = new Set((pedido.acciones || []).map(String));
    const menus = new Set((pedido.menus || []).map(String));

    const desconocidas = [...acciones].filter(a => !contratado.acciones.has(a));
    const menusDesconocidos = [...menus].filter(m => !contratado.menus.has(m));
    if (desconocidas.length || menusDesconocidos.length) {
        throw new Regla(`Permiso que no existe o que la empresa no tiene contratado: ${ [...menusDesconocidos, ...desconocidas].join(', ') }`);
    }

    if (acciones.size) {
        const deAcciones = await db.global.query('SELECT DISTINCT menu FROM cat_acciones WHERE accion IN (:a)',
            { replacements: { a: [...acciones] } });
        deAcciones.forEach(x => menus.add(x.menu));
    }
    siempre.forEach(m => menus.delete(m));

    if (!otorgante.admin) {
        const cambia = (antes, despues) => [
            ...[...despues].filter(x => !antes.has(x)),
            ...[...antes].filter(x => !despues.has(x))
        ];
        const menusAjenos = cambia(new Set(actual.menus), menus).filter(m => !otorgante.menus.has(m));
        const accionesAjenas = cambia(new Set(actual.acciones), acciones).filter(a => !otorgante.acciones.has(a));
        if (menusAjenos.length || accionesAjenas.length) {
            throw new Regla(`No puedes dar ni quitar permisos que tú no tienes: ${ await etiquetas(menusAjenos, accionesAjenas) }`);
        }
    }

    return { menus: [...menus].sort(), acciones: [...acciones].sort() };
};

/** Usuarios activos con un rol protegido activo, sin contar a `excepto`. */
const administradoresActivos = async (req, excepto, transaction) => {
    const [f] = await db.empresa(req).query(`
        SELECT COUNT(DISTINCT uer.idUsuario) AS n
          FROM usuarios_empresa_roles uer
          JOIN roles r ON r.idEmpresa = uer.idEmpresa AND r.idRol = uer.idRol
          JOIN usuarios_empresa ue ON ue.idEmpresa = uer.idEmpresa AND ue.idUsuario = uer.idUsuario
          JOIN usuarios u ON u.idUsuario = uer.idUsuario
         WHERE uer.idEmpresa = :idEmpresa AND r.bProtegido = 1 AND r.bActivo = 1
           AND ue.bActivo = 1 AND u.bActivo = 1 AND uer.idUsuario <> :excepto`,
    { replacements: { excepto: excepto || 0 }, transaction });
    return Number(f.n);
};

module.exports = { Regla, prepararCambio, administradoresActivos, etiquetas };
