#!/usr/bin/env node
// =============================================================================
// Pruebas de configuración de la empresa, constantes y zona (análisis 003)
//     node scripts/instalar.js --demo --reiniciar   (deja todo como nuevo)
//     npm run dev                                   (en otra terminal)
//     npm run pruebas:configuracion
// Deja los datos como los encontró.
// =============================================================================
const { ID, llamar, entrar, sql, ejecutar, marcador, correo } = require('./lib-pruebas');
const configuracion = require('../helpers/configuracion');
const constantes = require('../helpers/constantes');
const fs = require('fs');
const path = require('path');

const TOL = 'asistencia.tolerancia_retardo';
const CIERRE = 'asistencia.dias_cierre';
const SEMANA = 'asistencia.inicio_semana';
const NUEVO = 'prueba.ajuste_nuevo';

const sinPermiso = (r) => r.status_code === 1 && r.data?.codigo === 'SIN_PERMISO';
const ajustes = (r) => (r.data?.grupos || []).flatMap(g => g.ajustes.map(a => ({ ...a, grupo: g.grupo })));
const ajuste = (r, clave) => ajustes(r).find(a => a.clave === clave);

(async () => {
    const m = marcador();
    const reqA = { idEmpresa: ID.A };
    const leer = async (clave, idSucursal) => { configuracion.invalidarCatalogo(); return configuracion.valor(reqA, clave, idSucursal); };
    const suc = async (idEmpresa, nombre) => (await sql(
        'SELECT idSucursal FROM sucursales WHERE idEmpresa = :e AND nombre = :n', { e: idEmpresa, n: nombre }))[0].idSucursal;
    const [matriz, norte, bMatriz] = [await suc(ID.A, 'Matriz'), await suc(ID.A, 'Norte'), await suc(ID.B, 'Matriz')];
    const idEncargado = (await sql('SELECT idUsuario FROM usuarios WHERE correo = :c', { c: correo('encargado.a') }))[0].idUsuario;

    const tA = await entrar('admin.a');
    const tB = await entrar('admin.b');
    const tC = await entrar('contador', ID.A);      // Recursos Humanos en A: ve, no cambia
    const tE = await entrar('encargado.a');         // solo Norte

    try {
        // ── Empresa nueva: valores iniciales, sin confirmar ──
        const filas = await sql(`SELECT clave, valor, bConfirmado FROM configuracion_valores
                                  WHERE idEmpresa = :a AND idSucursal IS NULL`, { a: ID.A });
        m.revisar('la empresa nueva tiene los 3 ajustes con su valor inicial y sin confirmar',
            filas.length === 3 && filas.every(f => !f.bConfirmado), JSON.stringify(filas));
        let r = await llamar('GET', '/configuracion/getConfiguracion', { token: tA });
        m.revisar('getConfiguracion: agrupados, con valor inicial y "revísalo"',
            r.status_code === 0 && ajuste(r, TOL)?.valor === 0 && ajuste(r, CIERRE)?.valor === 3
            && ajuste(r, SEMANA)?.valor === '1' && ajustes(r).every(a => !a.bConfirmado)
            && r.data.grupos[0].grupo === 'Asistencia', r.message);
        m.revisar('→ el combo trae sus opciones y la tolerancia su rango',
            ajuste(r, SEMANA)?.control === 'combo' && ajuste(r, SEMANA)?.opciones?.length === 7
            && ajuste(r, TOL)?.validacion?.max === 120);

        // ── Confirmar tal cual ──
        r = await llamar('POST', '/configuracion/confirmarConfiguracion', { token: tA, body: { claves: [SEMANA] } });
        m.revisar('confirmar el valor inicial sin cambiarlo', r.status_code === 0 && r.data.cambios === 1, r.message);
        r = await llamar('GET', '/configuracion/getConfiguracion', { token: tA });
        m.revisar('→ queda confirmado y con quién lo hizo', ajuste(r, SEMANA)?.bConfirmado && !!ajuste(r, SEMANA)?.modifico);

        // ── A cambia sus días de cierre y B no ──
        r = await llamar('POST', '/configuracion/setConfiguracion', { token: tA, body: { valores: [{ clave: CIERRE, valor: 5 }] } });
        m.revisar('A cambia sus días de cierre a 5', r.status_code === 0, r.message);
        r = await llamar('GET', '/configuracion/getConfiguracion', { token: tB });
        m.revisar('→ B sigue en 3 y sin confirmar', ajuste(r, CIERRE)?.valor === 3 && !ajuste(r, CIERRE)?.bConfirmado);
        m.revisar('→ el ayudante de A regresa 5 (número)', (await leer(CIERRE)) === 5);

        // ── Tolerancia: general y excepción por sucursal ──
        r = await llamar('POST', '/configuracion/setConfiguracion', { token: tA, body: { valores: [{ clave: TOL, valor: '10' }] } });
        m.revisar('tolerancia general de A: 10', r.status_code === 0, r.message);
        r = await llamar('POST', '/configuracion/setExcepcionSucursal', { token: tA, body: { idSucursal: norte, clave: TOL, valor: 5 } });
        m.revisar('Norte pone 5', r.status_code === 0, r.message);
        m.revisar('→ Norte usa 5, Matriz 10 y sin sucursal el general (10)',
            (await leer(TOL, norte)) === 5 && (await leer(TOL, matriz)) === 10 && (await leer(TOL)) === 10);
        r = await llamar('GET', '/configuracion/getConfiguracion', { token: tA });
        m.revisar('→ Configuración muestra que Norte tiene 5',
            JSON.stringify(ajuste(r, TOL)?.excepciones) === JSON.stringify([{ idSucursal: norte, nombre: 'Norte', valor: 5 }]),
            JSON.stringify(ajuste(r, TOL)?.excepciones));
        r = await llamar('POST', '/configuracion/setConfiguracion', { token: tA, body: { valores: [{ clave: TOL, valor: 15 }] } });
        m.revisar('→ el general cambia a 15 y Norte sigue en 5', r.status_code === 0
            && (await leer(TOL, norte)) === 5 && (await leer(TOL, matriz)) === 15);
        r = await llamar('GET', '/configuracion/getConfiguracionSucursal?idSucursal=' + norte, { token: tA });
        m.revisar('→ la sucursal ve el general (15) y su valor propio (5)',
            r.data?.ajustes?.[0]?.valorGeneral === 15 && r.data.ajustes[0].valorPropio === 5 && r.data.ajustes.length === 1,
            JSON.stringify(r.data?.ajustes));
        r = await llamar('POST', '/configuracion/setExcepcionSucursal', { token: tA, body: { idSucursal: norte, clave: TOL, valor: null } });
        m.revisar('→ quitar la excepción: Norte toma el general (15)', r.status_code === 0 && (await leer(TOL, norte)) === 15, r.message);

        // ── El ayudante: inicial si no hay valor, y falla con clave inexistente ──
        await ejecutar('DELETE FROM configuracion_valores WHERE idEmpresa = :a AND idSucursal IS NULL AND clave = :c', { a: ID.A, c: CIERRE });
        m.revisar('sin valor guardado, el ayudante regresa el valor inicial (3)', (await leer(CIERRE)) === 3);
        let lanzo = false;
        try { await leer('no.existe'); } catch { lanzo = true; }
        m.revisar('clave inexistente: el ayudante lanza error', lanzo);

        // ── Validación en el Back, llamando directo al API ──
        const rechazos = [
            [TOL, 'abc', /número entero/], [TOL, -1, /entre 0 y 120 minutos/], [TOL, 500, /entre 0 y 120 minutos/],
            [TOL, 10.5, /número entero/], [TOL, { a: 1 }, /no admite/], [TOL, '', /Escribe/],
            [CIERRE, '3; DROP TABLE x', /número entero/], [SEMANA, '9', /una de: Lunes/]
        ];
        for (const [clave, valor, re] of rechazos) {
            r = await llamar('POST', '/configuracion/setConfiguracion', { token: tA, body: { valores: [{ clave, valor }] } });
            m.revisar(`rechaza ${ clave } = ${ JSON.stringify(valor) }`, r.status_code === 1 && re.test(r.message), r.message);
        }
        r = await llamar('POST', '/configuracion/setConfiguracion', { token: tA, body: { valores: [{ clave: 'no.existe', valor: 1 }] } });
        m.revisar('rechaza una clave que no existe', r.status_code === 1, r.message);
        r = await llamar('POST', '/configuracion/setExcepcionSucursal', { token: tA, body: { idSucursal: norte, clave: CIERRE, valor: 2 } });
        m.revisar('rechaza una excepción en un ajuste que no la admite', r.status_code === 1 && /no admite/.test(r.message), r.message);
        r = await llamar('POST', '/configuracion/setExcepcionSucursal', { token: tA, body: { idSucursal: norte, clave: TOL, valor: 999 } });
        m.revisar('rechaza una excepción fuera de rango', r.status_code === 1 && /entre 0 y 120/.test(r.message), r.message);

        // ── Permisos ──
        r = await llamar('GET', '/configuracion/getConfiguracion', { token: tC });
        m.revisar('Recursos Humanos ve la configuración', r.status_code === 0 && r.data.puedeEditar === false, r.message);
        r = await llamar('POST', '/configuracion/setConfiguracion', { token: tC, body: { valores: [{ clave: TOL, valor: 3 }] } });
        m.revisar('Recursos Humanos sin la acción: "sin permiso"', sinPermiso(r), r.message);
        r = await llamar('GET', '/configuracion/getConfiguracion', { token: tE });
        m.revisar('el Encargado sin el menú no la consulta', sinPermiso(r), r.message);

        // Encargado (solo Norte) con la acción directa.
        r = await llamar('POST', '/configuracion/setExcepcionSucursal', { token: tA, body: { idSucursal: matriz, clave: TOL, valor: 7 } });
        r = await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA,
            body: { idUsuario: idEncargado, menus: [], acciones: ['configuracion_Editar'] } });
        m.revisar('el administrador da al Encargado "cambiar la configuración"', r.status_code === 0, r.message);
        r = await llamar('POST', '/configuracion/setExcepcionSucursal', { token: tE, body: { idSucursal: norte, clave: TOL, valor: 8 } });
        m.revisar('→ el Encargado cambia la excepción de Norte', r.status_code === 0 && (await leer(TOL, norte)) === 8, r.message);
        r = await llamar('POST', '/configuracion/setExcepcionSucursal', { token: tE, body: { idSucursal: matriz, clave: TOL, valor: 1 } });
        m.revisar('→ pero no la de Matriz', r.status_code === 1 && (await leer(TOL, matriz)) === 7, r.message);
        r = await llamar('POST', '/configuracion/setConfiguracion', { token: tE, body: { valores: [{ clave: TOL, valor: 1 }] } });
        m.revisar('→ ni el valor general', r.status_code === 1 && /todas las sucursales/.test(r.message), r.message);
        r = await llamar('GET', '/configuracion/getConfiguracion', { token: tE });
        m.revisar('→ en Configuración solo ve la excepción de Norte',
            r.status_code === 0 && JSON.stringify(ajuste(r, TOL)?.excepciones.map(e => e.nombre)) === '["Norte"]',
            JSON.stringify(ajuste(r, TOL)?.excepciones));
        r = await llamar('GET', '/configuracion/getConfiguracionSucursal?idSucursal=' + matriz, { token: tE });
        m.revisar('→ y no consulta la configuración de Matriz', r.status_code === 1, r.message);
        await llamar('POST', '/usuariosEmpresa/setPermisosDirectos', { token: tA, body: { idUsuario: idEncargado, menus: [], acciones: [] } });

        // ── Ajuste nuevo: solo una fila en el catálogo ──
        await ejecutar(`INSERT INTO cat_configuracion_ajustes
            (clave, grupo, orden, etiqueta, ayuda, tipoDato, control, valorInicial) VALUES
            (:c, 'Pruebas', 900, 'Ajuste de prueba', 'Solo para las pruebas.', 'booleano', 'switch', '0')`, { c: NUEVO });
        r = await llamar('GET', '/configuracion/getConfiguracion', { token: tA });
        const nuevo = ajuste(r, NUEVO);
        m.revisar('un ajuste insertado en el catálogo aparece en su grupo, con su control',
            nuevo?.grupo === 'Pruebas' && nuevo.control === 'switch' && nuevo.valor === false && !nuevo.bConfirmado,
            JSON.stringify(nuevo));
        r = await llamar('POST', '/configuracion/setConfiguracion', { token: tA, body: { valores: [{ clave: NUEVO, valor: true }] } });
        m.revisar('→ se guarda (booleano)', r.status_code === 0 && (await leer(NUEVO)) === true, r.message);
        r = await llamar('POST', '/configuracion/setConfiguracion', { token: tA, body: { valores: [{ clave: NUEVO, valor: 'quizá' }] } });
        m.revisar('→ y rechaza lo que no es sí o no', r.status_code === 1 && /sí o no/.test(r.message), r.message);

        // ── Constantes del sistema ──
        constantes.invalidar();
        m.revisar('constante sin valor de empresa: la global (50)',
            (await constantes.valor('sesion.intentos_por_ip')) === 50 && (await constantes.valor('sesion.intentos_por_ip', reqA)) === 50);
        await ejecutar(`INSERT INTO constantes_valores (idEmpresa, clave, valor) VALUES (:a, 'sesion.intentos_por_ip', '77')`, { a: ID.A });
        constantes.invalidar();
        m.revisar('con valor para A: A recibe 77, B y la global siguen en 50',
            (await constantes.valor('sesion.intentos_por_ip', reqA)) === 77
            && (await constantes.valor('sesion.intentos_por_ip', { idEmpresa: ID.B })) === 50
            && (await constantes.valor('sesion.intentos_por_ip')) === 50);
        lanzo = false;
        try { await constantes.valor('no.existe'); } catch { lanzo = true; }
        m.revisar('constante inexistente: lanza error', lanzo);
        const dirRutas = path.join(__dirname, '..', 'routes');
        // Solo las rutas de empresa: routes/panel/ (009) es del superadministrador.
        const expuestas = fs.readdirSync(dirRutas).filter(a => a.endsWith('.js'))
            .filter(a => /constantes/i.test(fs.readFileSync(path.join(dirRutas, a), 'utf8')));
        r = await llamar('GET', '/constantes/getConstantes', { token: tA });
        m.revisar('ninguna ruta del cliente expone las constantes', expuestas.length === 0 && r.http === 404, expuestas.join());

        // ── Cambio de zona de una sucursal ──
        const body = { idSucursal: norte, nombre: 'Norte', zonaHoraria: 'America/Tijuana' };
        r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tA, body });
        const zona = async () => (await sql('SELECT zonaHoraria FROM sucursales WHERE idSucursal = :s', { s: norte }))[0].zonaHoraria;
        m.revisar('cambiar la zona sin confirmar: pide confirmación y no cambia',
            r.status_code === 1 && r.data?.codigo === 'CONFIRMAR_ZONA' && /no se recalcula/.test(r.message)
            && (await zona()) === 'America/Mazatlan', r.message);
        r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tA, body: { ...body, confirmarZona: true } });
        m.revisar('→ confirmado: cambia', r.status_code === 0 && (await zona()) === 'America/Tijuana', r.message);
        r = await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tA, body: { ...body, nombre: 'Norte' } });
        m.revisar('→ editar sin cambiar la zona no pide confirmación', r.status_code === 0, r.message);
        await llamar('POST', '/sucursales/insertUpdateSucursal', { token: tA,
            body: { ...body, zonaHoraria: 'America/Mazatlan', confirmarZona: true } });

        // ── Bitácora ──
        const bit = await sql(`SELECT tipo, COUNT(*) AS n FROM bitacora_configuracion WHERE idEmpresa = :a GROUP BY tipo`, { a: ID.A });
        const n = (t) => bit.find(b => b.tipo === t)?.n || 0;
        m.revisar('bitácora: ajustes, confirmaciones, excepciones y zonas',
            n('AJUSTE') >= 4 && n('CONFIRMACION') >= 1 && n('EXCEPCION') >= 4 && n('ZONA') === 2, JSON.stringify(bit));
        const [quitada] = await sql(`SELECT antes, despues FROM bitacora_configuracion
            WHERE idEmpresa = :a AND tipo = 'EXCEPCION' AND idSucursal = :s ORDER BY idBitacora LIMIT 1 OFFSET 1`, { a: ID.A, s: norte });
        m.revisar('→ quitar la excepción guarda el antes (5) y el después vacío', quitada?.antes === '5' && quitada.despues === null,
            JSON.stringify(quitada));
        r = await llamar('GET', '/configuracion/getBitacoraConfiguracion', { token: tA });
        m.revisar('→ se consulta por el API', r.status_code === 0 && r.data.length >= 10, r.message);
        const bitB = await sql('SELECT COUNT(*) AS n FROM bitacora_configuracion WHERE idEmpresa = :b', { b: ID.B });
        m.revisar('→ nada en la bitácora de B', bitB[0].n === 0);
        void bMatriz;
    } finally {
        // Deja todo como estaba.
        await ejecutar('DELETE FROM configuracion_valores WHERE idEmpresa = :a', { a: ID.A });
        await ejecutar('DELETE FROM configuracion_valores WHERE clave = :c', { c: NUEVO });
        await ejecutar('DELETE FROM cat_configuracion_ajustes WHERE clave = :c', { c: NUEVO });
        await ejecutar('DELETE FROM bitacora_configuracion WHERE idEmpresa = :a', { a: ID.A });
        await ejecutar(`DELETE FROM constantes_valores WHERE idEmpresa = :a`, { a: ID.A });
        await ejecutar('CALL sp_preparar_configuracion(:a)', { a: ID.A });
        await ejecutar(`UPDATE sucursales SET zonaHoraria = 'America/Mazatlan' WHERE idSucursal = :s`, { s: norte });
        await ejecutar('DELETE FROM usuarios_empresa_acciones WHERE idEmpresa = :a AND idUsuario = :u', { a: ID.A, u: idEncargado });
    }

    await m.terminar('Configuración, constantes y zona');
})().catch(async (e) => {
    console.error('✘', e);
    process.exit(1);
});
