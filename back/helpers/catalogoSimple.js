// =============================================================================
// Armador de catálogos simples de la empresa (análisis 004): puestos y
// departamentos. Nombre único por empresa (sin distinguir mayúsculas ni
// espacios de más) y activo o inactivo; nunca se borran.
//
//     const c = catalogoSimple({ tabla: 'puestos', id: 'idPuesto',
//         campoEmpleado: 'idPuesto', singular: 'puesto', plural: 'puestos', genero: 'o' });
//     c.getLista, c.insertUpdate, c.disable   → controladores de Express
//     c.normalizar(nombre)                    → nombre limpio
//
// La tabla y las columnas vienen del código, nunca del navegador.
// =============================================================================

const { db, QueryTypes } = require('./db');

/** Quita espacios de más: '  Jefe   de  turno ' → 'Jefe de turno'. */
const normalizar = (nombre) => String(nombre ?? '').trim().replace(/\s+/g, ' ');

const catalogoSimple = ({ tabla, id, campoEmpleado, singular, plural, genero = 'o' }) => {
    const Singular = singular[0].toUpperCase() + singular.slice(1);
    const MSG_NO_EXISTE = `El ${ singular } no existe`;
    const art = genero === 'a' ? 'una' : 'un';

    /** GET get<Plural>?estado=activos|todos — con cuántos empleados activos tiene cada uno. */
    const getLista = async (req, res) => {
        try {
            const soloActivos = req.query.estado !== 'todos';
            const data = await db.empresa(req).query(`
                SELECT c.${ id } AS id, c.nombre, c.bActivo, c.fechaAlta,
                       (SELECT COUNT(*) FROM empleados e
                         WHERE e.idEmpresa = :idEmpresa AND e.${ campoEmpleado } = c.${ id }
                           AND e.estado = 'ACTIVO') AS empleados
                  FROM ${ tabla } c
                 WHERE c.idEmpresa = :idEmpresa
                   AND (:soloActivos = 0 OR c.bActivo = 1)
                 ORDER BY c.bActivo DESC, c.nombre`, { replacements: { soloActivos: soloActivos ? 1 : 0 } });
            return res.json({ status_code: 0, message: `${ data.length } ${ plural }`, data });
        } catch (error) {
            console.error(`get ${ plural }`, error);
            return res.json({ status_code: 2, message: `No fue posible consultar los ${ plural }`, data: null });
        }
    };

    /** POST insertUpdate<Singular> { id?, nombre } */
    const insertUpdate = async (req, res) => {
        const idRegistro = req.body.id ? Number(req.body.id) : null;
        const nombre = normalizar(req.body.nombre);
        try {
            if (!nombre) return res.json({ status_code: 1, message: `Escribe el nombre del ${ singular }`, data: null });
            if (nombre.length > 100) return res.json({ status_code: 1, message: 'El nombre admite hasta 100 caracteres', data: null });
            if (idRegistro) {
                const [actual] = await db.empresa(req).query(
                    `SELECT ${ id } FROM ${ tabla } WHERE idEmpresa = :idEmpresa AND ${ id } = :idRegistro`,
                    { replacements: { idRegistro } });
                if (!actual) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
            }
            const [repetido] = await db.empresa(req).query(`
                SELECT ${ id } AS id, bActivo FROM ${ tabla }
                 WHERE idEmpresa = :idEmpresa AND nombre = :nombre AND ${ id } <> :idRegistro`,
            { replacements: { nombre, idRegistro: idRegistro || 0 } });
            if (repetido) {
                return res.json({
                    status_code: 1,
                    message: `Ya existe ${ art } ${ singular } llamad${ genero } "${ nombre }"${ repetido.bActivo ? '' : ' (inactiv' + genero + ')' }`,
                    data: { codigo: 'REPETIDO', id: repetido.id, bActivo: repetido.bActivo }
                });
            }
            if (idRegistro) {
                await db.empresa(req).query(
                    `UPDATE ${ tabla } SET nombre = :nombre WHERE idEmpresa = :idEmpresa AND ${ id } = :idRegistro`,
                    { replacements: { nombre, idRegistro }, type: QueryTypes.UPDATE });
                return res.json({ status_code: 0, message: `${ Singular } actualizad${ genero } correctamente`, data: { id: idRegistro, nombre } });
            }
            const [nuevo] = await db.empresa(req).query(
                `INSERT INTO ${ tabla } (idEmpresa, nombre) VALUES (:idEmpresa, :nombre)`,
                { replacements: { nombre }, type: QueryTypes.INSERT });
            return res.json({ status_code: 0, message: `${ Singular } cread${ genero } correctamente`, data: { id: nuevo, nombre } });
        } catch (error) {
            if (error?.original?.errno === 1062) {
                return res.json({ status_code: 1, message: `Ya existe ${ art } ${ singular } llamad${ genero } "${ nombre }"`, data: null });
            }
            console.error(`insertUpdate ${ singular }`, error);
            return res.json({ status_code: 2, message: `No fue posible guardar el ${ singular }`, data: null });
        }
    };

    /** PUT disable<Singular> { id, bActivo } — nunca se borra; los empleados lo conservan. */
    const disable = async (req, res) => {
        const idRegistro = Number(req.body.id);
        const bActivo = req.body.bActivo ? 1 : 0;
        try {
            const [actual] = await db.empresa(req).query(
                `SELECT ${ id } AS id, nombre FROM ${ tabla } WHERE idEmpresa = :idEmpresa AND ${ id } = :idRegistro`,
                { replacements: { idRegistro } });
            if (!actual) return res.json({ status_code: 1, message: MSG_NO_EXISTE, data: null });
            await db.empresa(req).query(
                `UPDATE ${ tabla } SET bActivo = :bActivo WHERE idEmpresa = :idEmpresa AND ${ id } = :idRegistro`,
                { replacements: { bActivo, idRegistro }, type: QueryTypes.UPDATE });
            return res.json({
                status_code: 0,
                message: `${ Singular } ${ actual.nombre } ${ bActivo ? 'activad' : 'desactivad' }${ genero }`,
                data: { id: idRegistro }
            });
        } catch (error) {
            console.error(`disable ${ singular }`, error);
            return res.json({ status_code: 2, message: `No fue posible cambiar el estado del ${ singular }`, data: null });
        }
    };

    return { getLista, insertUpdate, disable, normalizar };
};

module.exports = { catalogoSimple, normalizar };
