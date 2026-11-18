// =============================================================================
// Plan vigente de la empresa DE LA SESIÓN (análisis 009, T22)
// =============================================================================
// Lo usa el código de la empresa (límite del plan al dar de alta empleados y
// el aviso de uso). `cat_planes` es del panel: esta es su única lectura fuera
// de db.panel, con `db.planDeEmpresa(req)` (solo lectura, solo estas dos
// tablas, filtrada por la empresa de la sesión). El guardián no deja usarla
// en otro archivo.
// =============================================================================

const { db } = require('../db');

/** { idPlan, nombre, tipoCobro, limiteEmpleados } del plan vigente, o null si no tiene. */
const planVigente = async (req, transaction) => {
    const [p] = await db.planDeEmpresa(req).query(`
        SELECT /* panel: plan vigente de la empresa de la sesión (límite y aviso), solo lectura */
               p.idPlan, p.nombre, p.tipoCobro, p.limiteEmpleados
          FROM empresas_planes ep
          JOIN cat_planes p ON p.idPlan = ep.idPlan
         WHERE ep.idEmpresa = :idEmpresa AND ep.vigente = 1`, { transaction });
    if (!p) return null;
    return { ...p, limiteEmpleados: p.limiteEmpleados === null ? null : Number(p.limiteEmpleados) };
};

module.exports = { planVigente };
