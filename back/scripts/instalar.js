#!/usr/bin/env node
// =============================================================================
// Instalación y mantenimiento de cuentas (análisis 001)
// =============================================================================
// Primera empresa, su sucursal y su administrador (interactivo si faltan datos):
//     node scripts/instalar.js --empresa "Mi Empresa" --sucursal Matriz \
//          --zona America/Mexico_City --correo admin@miempresa.com \
//          --nombre "Nombre Apellido" --password "********" [--plan "Sin límite"]
// Es la misma alta que el panel (helpers/empresaAlta.js, 009): queda con plan
// y su renglón ALTA en el historial.
//
// Datos de demostración (SOLO pruebas): dos empresas activas, una suspendida
// y cuentas para probar el selector y las fugas. La contraseña de todas las
// cuentas demo se escribe en back/.demo.env (no se versiona).
//     node scripts/instalar.js --demo [--reiniciar]
//
// Mantenimiento de una cuenta (lo que todavía no tiene pantalla):
//     node scripts/instalar.js --desactivar-usuario correo@x.com
//     node scripts/instalar.js --password-usuario correo@x.com --password "nueva"
//
// Superadministrador del panel (análisis 009; cuenta aparte de los usuarios).
// Imprime el secreto del segundo factor y su dirección otpauth:// y pide el
// primer código de la app para confirmar; sin código correcto no guarda nada:
//     node scripts/instalar.js --superadmin correo@x.com --nombre "Nombre" --password "********"
//     node scripts/instalar.js --restablecer-2fa correo@x.com
//     node scripts/instalar.js --desactivar-superadmin correo@x.com
// La demo crea además superadmin@demo.test (secreto en .demo.env).
// =============================================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline/promises');
const { QueryTypes } = require('sequelize');
const { dbConnection } = require('../database/config');
const { normalizarCorreo, correoValido, hashPassword, passwordValido, PASSWORD_MIN } = require('../helpers/sesion');
const empresaAlta = require('../helpers/empresaAlta');
const { rolDePlantilla } = empresaAlta;
const totp = require('../helpers/panel/totp');

const ZONA_DEFAULT = 'America/Mexico_City';
const DEMO_RAZON = 'Empresa de demostración (instalar.js --demo)';
const DEMO_DOMINIO = '@demo.test';

const args = (() => {
    const out = {};
    const v = process.argv.slice(2);
    for (let i = 0; i < v.length; i++) {
        if (!v[i].startsWith('--')) continue;
        const [k, igual] = v[i].slice(2).split(/=(.*)/s);
        if (igual !== undefined) out[k] = igual;
        else if (v[i + 1] && !v[i + 1].startsWith('--')) out[k] = v[++i];
        else out[k] = true;
    }
    return out;
})();

const q = (sql, replacements = {}, opts = {}) => dbConnection.query(sql, { replacements, type: QueryTypes.SELECT, ...opts });
const ins = async (sql, replacements, transaction) =>
    (await dbConnection.query(sql, { replacements, type: QueryTypes.INSERT, transaction }))[0];

// ── Piezas ───────────────────────────────────────────────────────────────────

/**
 * Plan con el que el script da de alta empresas (009): "Sin límite", o el
 * de `--plan "Nombre"`. Lo crea SQL/009.
 */
const planInicial = async (t) => {
    const nombre = typeof args.plan === 'string' ? args.plan : 'Sin límite';
    const [p] = await q('SELECT idPlan FROM cat_planes WHERE nombre = :nombre AND bActivo = 1', { nombre }, { transaction: t });
    if (!p) throw new Error(`No existe el plan activo "${ nombre }" (corre SQL/009_superadministrador_y_planes.sql o usa --plan)`);
    return p.idPlan;
};

/**
 * Empresa de la demo con las mismas piezas que la alta del panel
 * (helpers/empresaAlta.js): módulos y roles de plantilla, plan y renglón ALTA.
 */
const crearEmpresa = async (t, nombre, { razon = null, estado = 'ACTIVA' } = {}) => {
    const { idEmpresa } = await empresaAlta.crearEmpresa({ nombreComercial: nombre, razonSocial: razon, estado }, t);
    await empresaAlta.registrarAlta(idEmpresa, { idPlan: await planInicial(t), detalle: 'Alta por instalar.js --demo' }, t);
    return idEmpresa;
};

const crearSucursal = async (t, idEmpresa, nombre, zona = ZONA_DEFAULT) => {
    const id = await ins('INSERT INTO sucursales (idEmpresa, nombre, zonaHoraria) VALUES (:idEmpresa, :nombre, :zona)',
        { idEmpresa, nombre, zona }, t);
    // Análisis 005: la sucursal arranca con el dispositivo checador permitido.
    await require('../helpers/empresaAlta').prepararChecador(idEmpresa, t);
    return id;
};

const crearCuenta = async (t, correo, nombre, password) => {
    const [existe] = await q('SELECT idUsuario FROM usuarios WHERE correo = :correo', { correo }, { transaction: t });
    if (existe) return existe.idUsuario;
    return ins('INSERT INTO usuarios (correo, passwordHash, nombre) VALUES (:correo, :hash, :nombre)',
        { correo, hash: hashPassword(password), nombre }, t);
};

/** Acceso a la empresa con el rol de una plantilla (ADMINISTRADOR, RH, ENCARGADO, EMPLEADO) o sin rol. */
const darAcceso = async (t, idEmpresa, idUsuario, { rol = null, sucursales = null, activo = true } = {}) => {
    await ins(`INSERT INTO usuarios_empresa (idEmpresa, idUsuario, bTodasSucursales, bActivo)
               VALUES (:idEmpresa, :idUsuario, :todas, :activo)`,
    { idEmpresa, idUsuario, todas: sucursales ? 0 : 1, activo: activo ? 1 : 0 }, t);
    for (const idSucursal of sucursales || []) {
        await ins('INSERT INTO usuarios_empresa_sucursales (idEmpresa, idUsuario, idSucursal) VALUES (:idEmpresa, :idUsuario, :idSucursal)',
            { idEmpresa, idUsuario, idSucursal }, t);
    }
    if (rol) {
        await ins('INSERT INTO usuarios_empresa_roles (idEmpresa, idUsuario, idRol) VALUES (:idEmpresa, :idUsuario, :idRol)',
            { idEmpresa, idUsuario, idRol: await rolDePlantilla(idEmpresa, rol, t) }, t);
    }
};

/** Puestos o departamentos de la demo: { nombre: id }. */
const crearCatalogo = async (t, tabla, idEmpresa, nombres) => {
    const out = {};
    for (const nombre of nombres) out[nombre] = await ins(`INSERT INTO ${ tabla } (idEmpresa, nombre) VALUES (:idEmpresa, :nombre)`, { idEmpresa, nombre }, t);
    return out;
};

/**
 * Empleado de la demo (004) con sus periodos y precios.
 * periodos: [[ingreso, baja?, motivo?], ...] en orden; el último define el estado.
 * precios: [[precioHora, aPartirDe], ...]
 */
const crearEmpleadoDemo = async (t, idEmpresa, e) => {
    const ultimo = e.periodos[e.periodos.length - 1];
    const idEmpleado = await ins(`
        INSERT INTO empleados (idEmpresa, numeroEmpleado, nombre, apellidoPaterno, apellidoMaterno,
                               idSucursalPrincipal, idSucursalOperativa, idPuesto, idDepartamento,
                               estado, fechaIngreso, fechaBaja, motivoBaja, telefono, curp, idUsuario)
        VALUES (:idEmpresa, :numero, :nombre, :paterno, :materno, :principal, :operativa, :puesto, :depto,
                :estado, :ingreso, :baja, :motivo, :telefono, :curp, :idUsuario)`, {
        idEmpresa, numero: e.numero, nombre: e.nombre, paterno: e.paterno, materno: e.materno ?? null,
        principal: e.principal, operativa: e.operativa ?? e.principal, puesto: e.puesto ?? null, depto: e.depto ?? null,
        estado: ultimo[1] ? 'BAJA' : 'ACTIVO', ingreso: ultimo[0], baja: ultimo[1] ?? null, motivo: ultimo[2] ?? null,
        telefono: e.telefono ?? null, curp: e.curp ?? null, idUsuario: e.idUsuario ?? null
    }, t);
    for (const [ingreso, baja = null, motivo = null] of e.periodos) {
        await ins(`INSERT INTO empleados_periodos (idEmpresa, idEmpleado, fechaIngreso, fechaBaja, motivoBaja)
                   VALUES (:idEmpresa, :idEmpleado, :ingreso, :baja, :motivo)`, { idEmpresa, idEmpleado, ingreso, baja, motivo }, t);
    }
    for (const [precioHora, aPartirDe] of e.precios || []) {
        await ins(`INSERT INTO empleados_precios (idEmpresa, idEmpleado, precioHora, aPartirDe)
                   VALUES (:idEmpresa, :idEmpleado, :precioHora, :aPartirDe)`, { idEmpresa, idEmpleado, precioHora, aPartirDe }, t);
    }
    return idEmpleado;
};

// ── Modos ────────────────────────────────────────────────────────────────────

const preguntar = async (datos) => {
    const faltan = ['empresa', 'sucursal', 'correo', 'nombre', 'password'].filter(k => !datos[k]);
    if (!faltan.length) return datos;
    if (!process.stdin.isTTY) throw new Error(`Faltan parámetros: ${ faltan.map(f => '--' + f).join(', ') }`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const etiquetas = {
        empresa: 'Nombre comercial de la empresa', sucursal: 'Nombre de la primera sucursal',
        correo: 'Correo del administrador', nombre: 'Nombre del administrador',
        password: `Contraseña del administrador (mín. ${ PASSWORD_MIN })`
    };
    for (const k of faltan) datos[k] = (await rl.question(`${ etiquetas[k] }: `)).trim();
    rl.close();
    return datos;
};

const instalar = async () => {
    const d = await preguntar({
        empresa: args.empresa, sucursal: args.sucursal, zona: args.zona || ZONA_DEFAULT,
        correo: args.correo, nombre: args.nombre, password: args.password
    });
    d.correo = normalizarCorreo(d.correo);
    if (!correoValido(d.correo)) throw new Error('Correo no válido');
    if (!passwordValido(d.password)) throw new Error(`La contraseña debe tener al menos ${ PASSWORD_MIN } caracteres`);

    // La misma alta que el panel (009, T15): empresa, sucursal, administrador,
    // roles, módulos, plan e historial; la bitácora del producto dice que fue el script.
    await dbConnection.transaction(async (t) => {
        const r = await empresaAlta.altaEmpresa({
            nombreComercial: d.empresa, sucursal: d.sucursal, zonaHoraria: d.zona,
            correoAdmin: d.correo, nombreAdmin: d.nombre, password: d.password,
            idPlan: await planInicial(t), detalle: `Alta por instalar.js con la sucursal ${ d.sucursal } y el administrador ${ d.correo }`
        }, t);
        await ins(`
            INSERT INTO bitacora_producto (idSuperadmin, nombreSuperadmin, accion, idEmpresa, objeto, despues)
            VALUES (NULL, :autor, 'EMPRESA_ALTA', :idEmpresa, :objeto, :despues)`,
        { autor: AUTOR_SCRIPT, idEmpresa: r.idEmpresa, objeto: d.empresa,
            despues: JSON.stringify({ sucursal: d.sucursal, zonaHoraria: d.zona, administrador: d.correo, cuentaCreada: r.cuentaCreada }) }, t);
        console.log(`✔ Empresa "${ d.empresa }" (id ${ r.idEmpresa }) con la sucursal "${ d.sucursal }" y el administrador ${ d.correo }`
            + (r.cuentaCreada ? '' : ' (la cuenta ya existía: conserva su contraseña)'));
    });
};

const borrarDemo = async () => {
    const ids = (await q('SELECT idEmpresa FROM empresas WHERE razonSocial = :r', { r: DEMO_RAZON })).map(x => x.idEmpresa);
    await dbConnection.transaction(async (t) => {
        const o = { transaction: t, type: QueryTypes.DELETE };
        if (ids.length) {
            for (const tabla of [
                // 006 y 005 (antes que empleados y sucursales, por sus llaves)
                'bitacora_horarios', 'dias_programados', 'empleados_horario', 'sucursales_horario',
                'marcajes_evidencias', 'marcajes', 'marcajes_intentos', 'bitacora_checador', 'empleados_rostros',
                'empleados_consentimientos', 'consentimientos_texto', 'formas_empleado', 'formas_sucursal', 'dispositivos',
                'bitacora_empleados', 'empleados_precios', 'empleados_periodos', 'empleados',
                'puestos', 'departamentos', 'bitacora_configuracion', 'configuracion_valores', 'constantes_valores', 'usuarios_preferencias',
                'bitacora_permisos', 'usuarios_empresa_acciones', 'usuarios_empresa_menus',
                'usuarios_empresa_roles', 'usuarios_empresa_sucursales', 'usuarios_empresa',
                'roles_acciones', 'roles_menus', 'roles', 'empresas_modulos', 'sucursales',
                // 009 (después de las bitácoras, que apuntan a soporte_sesiones)
                'soporte_sesiones', 'empresas_exportaciones', 'empresas_conteo_diario', 'empresas_historial', 'empresas_planes',
                'empresas']) {
                await dbConnection.query(`DELETE FROM ${ tabla } WHERE idEmpresa IN (:ids)`, { replacements: { ids }, ...o });
            }
        }
        await dbConnection.query(`
            DELETE u FROM usuarios u
             WHERE u.correo LIKE :dom
               AND NOT EXISTS (SELECT 1 FROM usuarios_empresa ue WHERE ue.idUsuario = u.idUsuario)`,
        { replacements: { dom: `%${ DEMO_DOMINIO }` }, ...o });
    });
    // Fotos de empleados de las empresas demo (004).
    for (const id of ids) fs.rmSync(path.join(__dirname, '..', 'almacen', 'empresas', String(id)), { recursive: true, force: true });
    // Fotos de evidencia de los marcajes de la demo (005).
    for (const id of ids) fs.rmSync(path.join(__dirname, '..', 'almacen', 'evidencias', String(id)), { recursive: true, force: true });
    return ids.length;
};

const demo = async () => {
    if (process.env.NODE_ENV === 'production') throw new Error('--demo no se corre en producción');
    const [existe] = await q('SELECT COUNT(*) AS n FROM empresas WHERE razonSocial = :r', { r: DEMO_RAZON });
    if (existe.n > 0) {
        if (!args.reiniciar) {
            console.log('La demo ya existe. Usa --demo --reiniciar para borrarla y crearla de nuevo.');
            await superadminDemoFaltante();
            await planesDemoFaltantes();
            return;
        }
        console.log(`Demo anterior borrada (${ await borrarDemo() } empresas).`);
    }

    const password = crypto.randomBytes(9).toString('base64url');
    const ids = {};
    await dbConnection.transaction(async (t) => {
        const cuenta = (correo, nombre) => crearCuenta(t, correo + DEMO_DOMINIO, nombre, password);

        const A = await crearEmpresa(t, 'Demo A', { razon: DEMO_RAZON });
        const aMatriz = await crearSucursal(t, A, 'Matriz', 'America/Mexico_City');
        const aNorte = await crearSucursal(t, A, 'Norte', 'America/Mazatlan');

        const B = await crearEmpresa(t, 'Demo B', { razon: DEMO_RAZON });
        const bMatriz = await crearSucursal(t, B, 'Matriz', 'America/Tijuana');
        await crearSucursal(t, B, 'Centro', 'America/Mexico_City');

        const C = await crearEmpresa(t, 'Demo C', { razon: DEMO_RAZON, estado: 'SUSPENDIDA' });
        await crearSucursal(t, C, 'Matriz');

        const adminA = await cuenta('admin.a', 'Ana Administradora (A)');
        const adminB = await cuenta('admin.b', 'Beto Administrador (B)');
        const contador = await cuenta('contador', 'Carla Contadora (A y B)');
        const encargado = await cuenta('encargado.a', 'Ernesto Encargado (A, Norte)');
        const soloB = await cuenta('solo.b', 'Sofía Solo B');
        const suspendida = await cuenta('suspendida', 'Samuel de empresa suspendida');
        const sinEmpresa = await cuenta('sinempresa', 'Sergio sin empresa activa');

        await darAcceso(t, A, adminA, { rol: 'ADMINISTRADOR' });
        await darAcceso(t, A, contador, { rol: 'RH' });
        await darAcceso(t, A, encargado, { rol: 'ENCARGADO', sucursales: [aNorte] });
        await darAcceso(t, B, adminB, { rol: 'ADMINISTRADOR' });
        await darAcceso(t, B, contador, { rol: 'ADMINISTRADOR' });
        await darAcceso(t, B, soloB, { rol: 'EMPLEADO', sucursales: [bMatriz] });
        await darAcceso(t, C, suspendida, { rol: 'ADMINISTRADOR' });
        await darAcceso(t, A, sinEmpresa, { activo: false });

        // Empleados (004): activos, uno de baja, uno con reingreso; en B, uno ligado a solo.b.
        const pA = await crearCatalogo(t, 'puestos', A, ['Operador', 'Supervisor', 'Almacenista']);
        const dA = await crearCatalogo(t, 'departamentos', A, ['Producción', 'Administración']);
        const empA = [
            { numero: '1', nombre: 'Juan', paterno: 'Pérez', materno: 'García', principal: aMatriz, puesto: pA.Operador, depto: dA['Producción'],
                curp: 'PEGJ900101HDFRRN09', periodos: [['2024-03-01']], precios: [[55, '2024-03-01'], [60, '2026-01-01']] },
            { numero: '2', nombre: 'Laura', paterno: 'Martínez', materno: 'Soto', principal: aMatriz, puesto: pA.Supervisor,
                depto: dA['Administración'], periodos: [['2023-08-15']], precios: [[80, '2023-08-15']] },
            { numero: '3', nombre: 'Pedro', paterno: 'Gómez', materno: 'Ruiz', principal: aNorte, puesto: pA.Operador, depto: dA['Producción'],
                periodos: [['2025-01-10']], precios: [[50, '2025-01-10']] },
            { numero: '4', nombre: 'Rosa', paterno: 'Hernández', materno: 'Díaz', principal: aNorte, puesto: pA.Almacenista,
                depto: dA['Producción'], periodos: [['2024-11-04']] },
            { numero: '5', nombre: 'Carlos', paterno: 'Ramírez', materno: 'León', principal: aMatriz, operativa: aNorte, puesto: pA.Operador,
                periodos: [['2025-05-12']], precios: [[52, '2025-05-12']] },
            { numero: '6', nombre: 'Ana', paterno: 'Torres', materno: 'Vega', principal: aNorte, puesto: pA.Operador,
                periodos: [['2023-01-09', '2025-06-30', 'Renuncia voluntaria']], precios: [[48, '2023-01-09']] },
            { numero: '7', nombre: 'Miguel', paterno: 'Sánchez', materno: 'Flores', principal: aMatriz, puesto: pA.Almacenista,
                periodos: [['2022-02-01', '2023-12-15', 'Fin de contrato'], ['2024-09-01']], precios: [[45, '2022-02-01'], [58, '2024-09-01']] }
        ];
        for (const e of empA) await crearEmpleadoDemo(t, A, e);

        const [{ idSucursal: bCentro }] = await q('SELECT idSucursal FROM sucursales WHERE idEmpresa = :B AND nombre = :n',
            { B, n: 'Centro' }, { transaction: t });
        const pB = await crearCatalogo(t, 'puestos', B, ['Cajero', 'Gerente']);
        const dB = await crearCatalogo(t, 'departamentos', B, ['Ventas']);
        const empB = [
            { numero: '1', nombre: 'Sofía', paterno: 'Morales', materno: 'Cruz', principal: bMatriz, puesto: pB.Cajero, depto: dB.Ventas,
                idUsuario: soloB, periodos: [['2024-02-01']], precios: [[65, '2024-02-01']] },
            { numero: '2', nombre: 'Jorge', paterno: 'Luna', materno: 'Rivas', principal: bCentro, puesto: pB.Gerente, depto: dB.Ventas,
                periodos: [['2023-05-02']], precios: [[90, '2023-05-02']] },
            { numero: '3', nombre: 'Elena', paterno: 'Castro', materno: 'Mora', principal: bMatriz, puesto: pB.Cajero,
                periodos: [['2024-01-15', '2025-03-31', 'Cambio de ciudad']] },
            { numero: '4', nombre: 'Raúl', paterno: 'Ortiz', materno: 'Peña', principal: bCentro, puesto: pB.Cajero,
                periodos: [['2022-06-01', '2023-06-30', 'Renuncia voluntaria'], ['2025-02-03']], precios: [[60, '2025-02-03']] }
        ];
        for (const e of empB) await crearEmpleadoDemo(t, B, e);

        Object.assign(ids, { A, B, C, aMatriz });
    });

    // Checador (005): dispositivos, consentimientos y un marcaje por revisar.
    const checador = await demoChecador(ids);

    // Panel (009): superadministrador de pruebas.
    const secretoPanel = await superadminDemo(password);

    const archivo = path.join(__dirname, '..', '.demo.env');
    fs.writeFileSync(archivo, [
        '# Cuentas de la demo (instalar.js --demo). NO versionar.',
        `DEMO_PASSWORD=${ password }`,
        `DEMO_ID_A=${ ids.A }`, `DEMO_ID_B=${ ids.B }`, `DEMO_ID_C=${ ids.C }`,
        '# Llave del dispositivo checador vinculado de la demo (005): solo para pruebas.',
        `DEMO_LLAVE_DISPOSITIVO=${ checador.llave }`,
        ...lineasPanelDemo(secretoPanel), ''
    ].join('\n'));

    console.log(`✔ Demo creada: Demo A (id ${ ids.A }), Demo B (id ${ ids.B }), Demo C suspendida (id ${ ids.C }).`);
    console.log('  Cuentas (dominio @demo.test): admin.a y admin.b (Administrador), contador (RH en A, Administrador en B),');
    console.log('  encargado.a (Encargado, solo Norte), solo.b (Empleado), suspendida, sinempresa.');
    console.log('  Empleados: 7 en A (Matriz y Norte; uno de baja y uno con reingreso) y 4 en B (uno ligado a solo.b).');
    console.log('  Checador: en A Matriz, "Entrada principal" vinculado y "Comedor" pendiente (código ' + checador.codigo + ', vence en minutos);');
    console.log('  consentimiento de Juan, Laura y Carlos (rostro de prueba sintético solo para Laura) y un marcaje por revisar.');
    console.log(`  Panel: ${ SUPERADMIN_DEMO } (misma contraseña; secreto del segundo factor en DEMO_PANEL_TOTP).`);
    console.log(`  La contraseña de todas está en ${ archivo }`);
};

// 1x1 JPEG gris: la foto de evidencia del marcaje de la demo.
const JPEG_DEMO = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

/**
 * Checador de la demo (análisis 005), en Demo A Matriz: un dispositivo
 * vinculado (su llave va a .demo.env) y uno pendiente; consentimiento de tres
 * empleados (uno con un rostro SINTÉTICO: no corresponde a una cara real) y
 * un marcaje por revisar hecho por el proceso (helpers/marcaje.js).
 */
const demoChecador = async ({ A, aMatriz }) => {
    const { hash, generarLlave, generarCodigo } = require('../helpers/llaves');
    const { registrarMarcaje } = require('../helpers/marcaje');
    const evidencias = require('../helpers/evidencias');
    const faceid = require('../helpers/faceid');
    const req = { idEmpresa: A };
    // Texto UTC con milisegundos: este script no corre con TZ=UTC.
    const { instanteSQL } = require('../helpers/marcaje');
    const ahora = instanteSQL(new Date());
    const llave = generarLlave();
    const codigo = generarCodigo();
    const [admin] = await q("SELECT idUsuario FROM usuarios WHERE correo = :c", { c: `admin.a${ DEMO_DOMINIO }` });
    const idVinculado = await ins(`INSERT INTO dispositivos (idEmpresa, idSucursal, nombre, estado, llaveHash, fechaVinculacion, ultimaConexion, idUsuarioCreo)
        VALUES (:A, :s, 'Entrada principal', 'VINCULADO', :llave, :ahora, :ahora, :u)`, { A, s: aMatriz, llave: hash(llave), ahora, u: admin.idUsuario });
    await ins(`INSERT INTO dispositivos (idEmpresa, idSucursal, nombre, estado, codigoHash, codigoVence, idUsuarioCreo)
        VALUES (:A, :s, 'Comedor', 'PENDIENTE', :codigo, :vence, :u)`, { A, s: aMatriz, codigo: hash(codigo), vence: instanteSQL(new Date(Date.now() + 10 * 60000)), u: admin.idUsuario });

    const emp = async (numero) => (await q('SELECT idEmpleado FROM empleados WHERE idEmpresa = :A AND numeroEmpleado = :numero', { A, numero }))[0]?.idEmpleado;
    const [ver] = await q('SELECT MAX(version) AS v FROM consentimientos_texto WHERE idEmpresa = :A', { A });
    for (const numero of ['1', '2', '5']) {
        const idEmpleado = await emp(numero);
        if (!idEmpleado) continue;
        await ins(`INSERT INTO empleados_consentimientos (idEmpresa, idEmpleado, version, fechaAceptacion, evidencia, idUsuarioRegistro)
            VALUES (:A, :idEmpleado, :v, :ahora, :ev, :u)`, { A, idEmpleado, v: ver.v, ahora, ev: JSON.stringify({ medio: 'PAPEL_FIRMADO', nota: 'Demo' }), u: admin.idUsuario });
    }
    const laura = await emp('2');
    if (laura) {
        const base = Array.from({ length: 128 }, (_, i) => Math.round(Math.sin(i * 7.3) * 880) / 10000);
        await faceid.guardarRostro({ idEmpresa: A, uid: admin.idUsuario }, { idEmpleado: laura, tomas: [base, base, base, base, base], promedio: base, calidad: { demo: true } });
    }
    const juan = await emp('1');
    if (juan) {
        const archivo = await evidencias.guardarFoto(A, Buffer.from(JPEG_DEMO, 'base64'));
        await registrarMarcaje(req, { idSucursal: aMatriz, idEmpleado: juan, forma: 'dispositivo', idDispositivo: idVinculado,
            evidencias: [
                { tipo: 'foto', archivo, vence: instanteSQL(new Date(Date.now() + 90 * 86400000)), dato: { dias: 90 } },
                { tipo: 'dispositivo', dato: { idDispositivo: idVinculado, nombre: 'Entrada principal' } },
                { tipo: 'faceid', dato: { resultado: 'SOLO_NUMERO', intentos: 3 } },
                { tipo: 'numero_empleado', dato: { numero: '1', folio: null } }
            ] });
    }
    return { llave, codigo };
};

const desactivarUsuario = async (correoArg) => {
    const correo = normalizarCorreo(correoArg);
    const [, n] = await dbConnection.query(
        'UPDATE usuarios SET bActivo = 0, versionSesion = versionSesion + 1 WHERE correo = :correo',
        { replacements: { correo }, type: QueryTypes.UPDATE });
    console.log(n ? `✔ ${ correo } desactivado: sale de todas sus empresas.` : `No existe la cuenta ${ correo }`);
};

const passwordUsuario = async (correoArg, password) => {
    const correo = normalizarCorreo(correoArg);
    if (!passwordValido(password)) throw new Error(`La contraseña debe tener al menos ${ PASSWORD_MIN } caracteres (--password)`);
    const [, n] = await dbConnection.query(
        'UPDATE usuarios SET passwordHash = :hash, versionSesion = versionSesion + 1 WHERE correo = :correo',
        { replacements: { correo, hash: hashPassword(password) }, type: QueryTypes.UPDATE });
    console.log(n ? `✔ Contraseña de ${ correo } cambiada; sus sesiones abiertas terminan.` : `No existe la cuenta ${ correo }`);
};

// ── Superadministrador del panel (análisis 009) ──────────────────────────────
// Cuenta en `superadmins`, nunca en `usuarios`. Lo que hace este script queda
// en bitacora_producto sin superadministrador (lo hizo el servidor).

const SUPERADMIN_DEMO = `superadmin${ DEMO_DOMINIO }`;
const AUTOR_SCRIPT = '(script en el servidor)';

const bitacoraScript = (accion, objeto, despues = null, t = null) => ins(`
    INSERT INTO bitacora_producto (idSuperadmin, nombreSuperadmin, accion, objeto, despues)
    VALUES (NULL, :autor, :accion, :objeto, :despues)`,
{ autor: AUTOR_SCRIPT, accion, objeto, despues: despues ? JSON.stringify(despues) : null }, t);

const superadminPorCorreo = async (correo) =>
    (await q('SELECT idSuperadmin, nombre, bActivo FROM superadmins WHERE correo = :correo', { correo }))[0];

/**
 * Imprime el secreto y su dirección otpauth:// y pide el código de la app
 * (3 intentos). Regresa el paso aceptado; sin código correcto, lanza.
 */
const confirmarSegundoFactor = async (secreto, correo) => {
    console.log('\nAgrega la cuenta en tu app de autenticación (Google Authenticator, Authy, 1Password…):');
    console.log(`  Secreto:   ${ secreto }`);
    console.log(`  Dirección: ${ totp.direccion(secreto, correo) }`);
    console.log('  (la dirección se puede convertir en código QR)\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const cerrado = new Promise(resolve => rl.once('close', () => resolve(null)));
    try {
        for (let i = 1; i <= 3; i++) {
            const codigo = await Promise.race([rl.question('Código de 6 dígitos que muestra la app: ').catch(() => null), cerrado]);
            if (codigo === null) break;
            const paso = totp.verificar(secreto, codigo);
            if (paso !== null) return paso;
            console.log('Código incorrecto.');
        }
    } finally {
        rl.close();
    }
    throw new Error('No se confirmó el código: no se guardó nada.');
};

const crearSuperadmin = async (correoArg, nombre, password) => {
    const correo = normalizarCorreo(correoArg);
    if (!correoValido(correo)) throw new Error('Correo no válido (--superadmin)');
    if (!nombre || nombre === true) throw new Error('Falta el nombre (--nombre "…"): la bitácora dice quién hizo qué');
    if (!passwordValido(password)) throw new Error(`La contraseña debe tener al menos ${ PASSWORD_MIN } caracteres (--password)`);
    if (await superadminPorCorreo(correo)) throw new Error(`Ya existe el superadministrador ${ correo } (usa --restablecer-2fa)`);

    const secreto = totp.generarSecreto();
    const paso = await confirmarSegundoFactor(secreto, correo);
    await dbConnection.transaction(async (t) => {
        await ins(`INSERT INTO superadmins (correo, nombre, passwordHash, totpSecreto, totpUltimoPaso)
                   VALUES (:correo, :nombre, :hash, :secreto, :paso)`,
        { correo, nombre, hash: hashPassword(password), secreto: totp.cifrar(secreto), paso }, t);
        await bitacoraScript('SUPERADMIN_ALTA', correo, { nombre }, t);
    });
    console.log(`✔ Superadministrador ${ correo } creado. Entra al panel con su correo, contraseña y el código de la app.`);
};

const restablecer2fa = async (correoArg) => {
    const correo = normalizarCorreo(correoArg);
    const cuenta = await superadminPorCorreo(correo);
    if (!cuenta) throw new Error(`No existe el superadministrador ${ correo }`);
    const secreto = totp.generarSecreto();
    const paso = await confirmarSegundoFactor(secreto, correo);
    await dbConnection.transaction(async (t) => {
        await dbConnection.query(`
            UPDATE superadmins SET totpSecreto = :secreto, totpUltimoPaso = :paso, versionSesion = versionSesion + 1
             WHERE idSuperadmin = :id`,
        { replacements: { secreto: totp.cifrar(secreto), paso, id: cuenta.idSuperadmin }, type: QueryTypes.UPDATE, transaction: t });
        await bitacoraScript('SUPERADMIN_2FA_RESTABLECIDO', correo, null, t);
    });
    console.log(`✔ Segundo factor de ${ correo } restablecido; sus sesiones del panel terminan.`);
};

const desactivarSuperadmin = async (correoArg) => {
    const correo = normalizarCorreo(correoArg);
    const cuenta = await superadminPorCorreo(correo);
    if (!cuenta) throw new Error(`No existe el superadministrador ${ correo }`);
    await dbConnection.transaction(async (t) => {
        await dbConnection.query('UPDATE superadmins SET bActivo = 0, versionSesion = versionSesion + 1 WHERE idSuperadmin = :id',
            { replacements: { id: cuenta.idSuperadmin }, type: QueryTypes.UPDATE, transaction: t });
        await bitacoraScript('SUPERADMIN_DESACTIVADO', correo, null, t);
    });
    console.log(`✔ Superadministrador ${ correo } desactivado; sus sesiones del panel terminan.`);
};

/**
 * Superadministrador de la demo, con la contraseña de la demo y un secreto
 * nuevo (sin pedir código). Nunca se borra (la bitácora lo referencia): se
 * reescribe. Regresa el secreto en claro para .demo.env.
 */
const superadminDemo = async (password) => {
    const secreto = totp.generarSecreto();
    await dbConnection.query(`
        INSERT INTO superadmins (correo, nombre, passwordHash, totpSecreto)
        VALUES (:correo, 'Superadministrador demo', :hash, :secreto)
        ON DUPLICATE KEY UPDATE passwordHash = VALUES(passwordHash), totpSecreto = VALUES(totpSecreto),
            totpUltimoPaso = NULL, bActivo = 1, versionSesion = versionSesion + 1`,
    { replacements: { correo: SUPERADMIN_DEMO, hash: hashPassword(password), secreto: totp.cifrar(secreto) }, type: QueryTypes.INSERT });
    return secreto;
};

const lineasPanelDemo = (secreto) => [
    '# Superadministrador del panel de la demo (009): misma contraseña; secreto TOTP en claro, solo pruebas.',
    `DEMO_PANEL_CORREO=${ SUPERADMIN_DEMO }`,
    `DEMO_PANEL_TOTP=${ secreto }`
];

/** Empresas de una demo creada antes del T15: les agrega su plan y su renglón ALTA. */
const planesDemoFaltantes = async () => {
    const faltan = await q(`
        SELECT e.idEmpresa FROM empresas e
         WHERE e.razonSocial = :r AND NOT EXISTS (SELECT 1 FROM empresas_planes p WHERE p.idEmpresa = e.idEmpresa)`, { r: DEMO_RAZON });
    if (!faltan.length) return;
    await dbConnection.transaction(async (t) => {
        const idPlan = await planInicial(t);
        for (const { idEmpresa } of faltan) {
            await empresaAlta.registrarAlta(idEmpresa, { idPlan, detalle: 'Alta por instalar.js --demo (plan agregado después)' }, t);
        }
    });
    console.log(`✔ Plan inicial agregado a ${ faltan.length } empresa(s) de la demo.`);
};

/** Demo creada antes del 009: le agrega su superadministrador sin rehacerla. */
const superadminDemoFaltante = async () => {
    const archivo = path.join(__dirname, '..', '.demo.env');
    const texto = fs.existsSync(archivo) ? fs.readFileSync(archivo, 'utf8') : '';
    const password = texto.match(/^DEMO_PASSWORD=(.+)$/m)?.[1]?.trim();
    if (!password || /^DEMO_PANEL_TOTP=/m.test(texto)) return;
    const secreto = await superadminDemo(password);
    fs.writeFileSync(archivo, `${ texto.replace(/\s*$/, '') }\n${ lineasPanelDemo(secreto).join('\n') }\n`);
    console.log(`✔ Superadministrador de la demo agregado: ${ SUPERADMIN_DEMO } (secreto en ${ archivo }).`);
};

(async () => {
    try {
        if (args.demo) await demo();
        else if (args.superadmin) await crearSuperadmin(args.superadmin, args.nombre, args.password);
        else if (args['restablecer-2fa']) await restablecer2fa(args['restablecer-2fa']);
        else if (args['desactivar-superadmin']) await desactivarSuperadmin(args['desactivar-superadmin']);
        else if (args['desactivar-usuario']) await desactivarUsuario(args['desactivar-usuario']);
        else if (args['password-usuario']) await passwordUsuario(args['password-usuario'], args.password);
        else await instalar();
        await dbConnection.close();
    } catch (e) {
        console.error(`✘ ${ e.message }`);
        await dbConnection.close().catch(() => {});
        process.exit(1);
    }
})();
