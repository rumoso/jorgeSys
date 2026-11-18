// Personas → Departamentos (análisis 004). Catálogo simple de la empresa.
const { catalogoSimple } = require('../helpers/catalogoSimple');

const c = catalogoSimple({ tabla: 'departamentos', id: 'idDepartamento', campoEmpleado: 'idDepartamento', singular: 'departamento', plural: 'departamentos', genero: 'o' });

module.exports = { getDepartamentos: c.getLista, insertUpdateDepartamento: c.insertUpdate, disableDepartamento: c.disable };
