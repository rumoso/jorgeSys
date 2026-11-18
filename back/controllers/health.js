const { response } = require('express');
const { dbConnection } = require('../database/config');

// GET /api/health
// Es infraestructura, no un endpoint de negocio: usa el codigo HTTP (200/503)
// porque es lo que leen los monitores y los balanceadores.
const getHealth = async (req, res = response) => {
    try {
        await dbConnection.query('SELECT 1', { logging: false });
        return res.json({
            status_code: 0,
            message: 'API y base de datos en linea',
            data: { db: true }
        });
    } catch (error) {
        console.error('health/getHealth', error.message);
        return res.status(503).json({
            status_code: 2,
            message: 'Base de datos no disponible',
            data: { db: false }
        });
    }
};

module.exports = { getHealth };
