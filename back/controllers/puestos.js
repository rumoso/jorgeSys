// Personas → Puestos (análisis 004). Catálogo simple de la empresa.
const { catalogoSimple } = require('../helpers/catalogoSimple');

const c = catalogoSimple({ tabla: 'puestos', id: 'idPuesto', campoEmpleado: 'idPuesto', singular: 'puesto', plural: 'puestos', genero: 'o' });

module.exports = { getPuestos: c.getLista, insertUpdatePuesto: c.insertUpdate, disablePuesto: c.disable };
