#!/usr/bin/env node
// =============================================================================
// Pruebas de la ubicación de la sucursal (análisis 015)
//     node scripts/instalar.js --demo --reiniciar   (una vez)
//     npm run dev                                   (en otra terminal)
//     npm run pruebas:ubicacion
// Deja los datos como los encontró.
// =============================================================================
const { ID, llamar, entrar, sql, ejecutar, marcador } = require('./lib-pruebas');
const { leerUbicacion } = require('../helpers/ubicacion');

const ZONA = 'America/Mexico_City';
const sinPermiso = (r) => r.status_code === 1 && r.data?.codigo === 'SIN_PERMISO';

(async () => {
    const m = marcador();
    const tA = await entrar('admin.a');
    const tC = await entrar('contador', ID.A);      // Recursos Humanos en A: ve sucursales, no las edita
    const [bMatriz] = await sql("SELECT idSucursal, nombre, zonaHoraria FROM sucursales WHERE idEmpresa = :b AND nombre = 'Matriz'", { b: ID.B });

    const nombre = `Ubicación ${ Date.now() }`;
    let id = null;
    const fila = async () => (await sql('SELECT latitud, longitud FROM sucursales WHERE idSucursal = :id', { id }))[0];
    const enLista = async (token = tA) => {
        const r = await llamar('GET', '/sucursales/getSucursales?estado=todas', { token });
        return r.data?.find(s => s.idSucursal === id);
    };
    const bitacora = async () => sql(`SELECT antes, despues FROM bitacora_configuracion
        WHERE idEmpresa = :a AND idSucursal = :id AND tipo = 'UBICACION' AND clave = 'sucursal.ubicacion'
        ORDER BY idBitacora`, { a: ID.A, id });
    const guardar = (ubicacion, token = tA) => llamar('POST', '/sucursales/insertUpdateSucursal', { token,
        body: { idSucursal: id, nombre, zonaHoraria: ZONA, ...ubicacion } });

    try {
        // ── El ayudante, sin servidor ──
        m.revisar('ayudante: vacías → sin ubicación',
            JSON.stringify(leerUbicacion('', null)) === JSON.stringify({ ok: true, latitud: null, longitud: null }));
        const u = leerUbicacion('19.43260849', -99.1332);
        m.revisar('ayudante: redondea a 6 decimales', u.ok && u.latitud === 19.432608 && u.longitud === -99.1332, JSON.stringify(u));

        // ── Crear con ubicación ──
        let r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tA,
            body: { nombre, zonaHoraria: ZONA, latitud: 19.43260849, longitud: '-99.1332' } });
        id = r.data?.id ?? null;
        m.revisar('crear con ubicación', r.status_code === 0 && !!id, r.message);
        let f = await fila();
        m.revisar('→ se guarda con 6 decimales', Number(f?.latitud) === 19.432608 && Number(f?.longitud) === -99.1332, JSON.stringify(f));
        let s = await enLista();
        m.revisar('→ getSucursales la regresa como número', s?.latitud === 19.432608 && s?.longitud === -99.1332, JSON.stringify(s));
        let b = await bitacora();
        m.revisar('→ bitácora del alta: antes vacío, después "lat, lng"',
            b.length === 1 && b[0].antes === null && b[0].despues === '19.432608, -99.1332', JSON.stringify(b));

        // ── Editar sin cambiarla: sin renglón nuevo ──
        r = await guardar({ latitud: '19.432608', longitud: -99.1332 });
        m.revisar('editar sin cambiar la ubicación no deja renglón', r.status_code === 0 && (await bitacora()).length === 1, r.message);

        // ── Mover ──
        r = await guardar({ latitud: 20.6597, longitud: -103.3496 });
        f = await fila();
        m.revisar('mover la ubicación', r.status_code === 0 && Number(f.latitud) === 20.6597 && Number(f.longitud) === -103.3496, r.message);
        b = await bitacora();
        m.revisar('→ bitácora: antes y después', b.length === 2 && b[1].antes === '19.432608, -99.1332' && b[1].despues === '20.6597, -103.3496',
            JSON.stringify(b));

        // ── Rechazos (directo al API) ──
        const rechazos = [
            ['solo la latitud', { latitud: 19.4, longitud: null }, /las dos/],
            ['solo la longitud', { latitud: '', longitud: -99.1 }, /las dos/],
            ['texto', { latitud: 'abc', longitud: -99.1 }, /número/],
            ['texto en la longitud', { latitud: 19.4, longitud: '-99.1; DROP TABLE x' }, /número/],
            ['latitud 91', { latitud: 91, longitud: -99.1 }, /entre -90 y 90/],
            ['longitud 181', { latitud: 19.4, longitud: 181 }, /entre -180 y 180/],
            ['(0, 0)', { latitud: 0, longitud: '0' }, /\(0, 0\)/],
            ['un booleano', { latitud: true, longitud: -99.1 }, /número/]
        ];
        for (const [que, ubic, re] of rechazos) {
            r = await guardar(ubic);
            m.revisar(`rechaza ${ que }`, r.status_code === 1 && re.test(r.message), r.message);
        }
        f = await fila();
        m.revisar('→ la ubicación sigue igual', Number(f.latitud) === 20.6597 && Number(f.longitud) === -103.3496 && (await bitacora()).length === 2,
            JSON.stringify(f));

        // ── Solo lectura ──
        s = await enLista(tC);
        m.revisar('Recursos Humanos (sin editar) ve la ubicación', s?.latitud === 20.6597 && s?.longitud === -103.3496, JSON.stringify(s));
        r = await guardar({ latitud: 21, longitud: -100 }, tC);
        f = await fila();
        m.revisar('→ pero no la cambia: "sin permiso"', sinPermiso(r) && Number(f.latitud) === 20.6597, r.message);

        // ── Quitar ──
        r = await guardar({ latitud: '', longitud: null });
        f = await fila();
        m.revisar('quitar la ubicación', r.status_code === 0 && f.latitud === null && f.longitud === null, JSON.stringify(f));
        s = await enLista();
        m.revisar('→ getSucursales la regresa vacía', s && s.latitud === null && s.longitud === null, JSON.stringify(s));
        b = await bitacora();
        m.revisar('→ bitácora: antes el punto, después vacío', b.length === 3 && b[2].antes === '20.6597, -103.3496' && b[2].despues === null,
            JSON.stringify(b));

        // ── Sucursal inactiva conserva su ubicación ──
        await guardar({ latitud: 19.5, longitud: -99.2 });
        r = await llamar('PUT', '/sucursales/disableSucursal', { token: tA, body: { idSucursal: id, bActivo: false } });
        f = await fila();
        m.revisar('desactivar conserva la ubicación', r.status_code === 0 && Number(f.latitud) === 19.5 && Number(f.longitud) === -99.2, r.message);

        // ── Fuga (LP-1): A edita la ubicación de una sucursal de B ──
        await ejecutar('UPDATE sucursales SET latitud = 25.6866, longitud = -100.3161 WHERE idSucursal = :s', { s: bMatriz.idSucursal });
        const antesB = JSON.stringify(await sql('SELECT * FROM sucursales WHERE idSucursal = :s', { s: bMatriz.idSucursal }));
        r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tA,
            body: { idSucursal: bMatriz.idSucursal, nombre: bMatriz.nombre, zonaHoraria: bMatriz.zonaHoraria, latitud: 19.4, longitud: -99.1 } });
        m.revisar('editar la ubicación de una sucursal de B → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tA,
            body: { idSucursal: bMatriz.idSucursal, nombre: bMatriz.nombre, zonaHoraria: bMatriz.zonaHoraria, latitud: null, longitud: null } });
        m.revisar('quitar la ubicación de una sucursal de B → no existe', r.status_code === 1 && /no existe/.test(r.message), r.message);
        const despuesB = JSON.stringify(await sql('SELECT * FROM sucursales WHERE idSucursal = :s', { s: bMatriz.idSucursal }));
        m.revisar('→ la sucursal de B no cambió', antesB === despuesB);
        const [bitB] = await sql("SELECT COUNT(*) AS n FROM bitacora_configuracion WHERE idEmpresa = :b AND tipo = 'UBICACION'", { b: ID.B });
        m.revisar('→ nada en la bitácora de B', bitB.n === 0);
        r = await llamar('GET', '/sucursales/getSucursales?estado=todas', { token: tA });
        m.revisar('→ A no ve la ubicación de B', r.status_code === 0 && !r.data.some(x => x.idSucursal === bMatriz.idSucursal), r.message);
    } finally {
        await ejecutar('UPDATE sucursales SET latitud = NULL, longitud = NULL WHERE idSucursal = :s', { s: bMatriz.idSucursal });
        if (id) {
            await ejecutar('DELETE FROM bitacora_configuracion WHERE idEmpresa = :a AND idSucursal = :id', { a: ID.A, id });
            await ejecutar('DELETE FROM formas_sucursal WHERE idSucursal = :id', { id });
            await ejecutar('DELETE FROM sucursales WHERE idSucursal = :id', { id });
        }
    }

    await m.terminar('Ubicación de la sucursal');
})().catch(async (e) => {
    console.error('✘', e);
    process.exit(1);
});
