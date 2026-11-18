// =============================================================================
// Personas → Empleados → Alta masiva desde Excel (análisis 004 §6)
// =============================================================================
// 1. getPlantillaImportacion: el Excel con los encabezados, un renglón de
//    ejemplo y una hoja con las sucursales, puestos y departamentos.
// 2. previsualizarImportacion (archivo): NO guarda nada. Cada renglón queda
//    correcto o con error, con su motivo; los puestos y departamentos que no
//    existen se listan como "se crearán".
// 3. importarEmpleados { renglones, crearCatalogos }: vuelve a validar cada
//    renglón con LA MISMA función (analizar → validarEmpleado, la del alta) y
//    carga solo los correctos, en una transacción.
// =============================================================================

const ExcelJS = require('exceljs');
const { db, QueryTypes } = require('../helpers/db');
const constantes = require('../helpers/constantes');
const { normalizar } = require('../helpers/catalogoSimple');
const {
    CAMPOS_PERSONALES, Regla, texto, llaveNombre, limpiar, siguienteNumero, permiteAlta,
    catalogos, validarEmpleado, posiblesDuplicados, crearEmpleado, guardarPrecio, validarPrecio
} = require('../helpers/empleados');
const { prepararIngreso } = require('../helpers/diasProgramados');

const ok = (res, message, data = null) => res.json({ status_code: 0, message, data });
const no = (res, message, data = null) => res.json({ status_code: 1, message, data });
const falla = (res, donde, error, message) => {
    if (error instanceof Regla) return no(res, error.message, error.data);
    console.error(donde, error);
    return res.json({ status_code: 2, message, data: null });
};
const puede = (req, accion) => !!req.permisos?.acciones?.has(accion);

const EJEMPLO = 'EJEMPLO';

/** Columnas de la plantilla, en orden. `texto`: la celda se formatea como texto (no pierde ceros). */
const COLUMNAS = [
    { clave: 'numeroEmpleado', titulo: 'Número de empleado', ancho: 18, texto: true, ayuda: 'Vacío: el sistema pone el siguiente' },
    { clave: 'nombre', titulo: 'Nombre(s)', ancho: 22, obligatoria: true },
    { clave: 'apellidoPaterno', titulo: 'Apellido paterno', ancho: 18, obligatoria: true },
    { clave: 'apellidoMaterno', titulo: 'Apellido materno', ancho: 18 },
    { clave: 'sucursal', titulo: 'Sucursal', ancho: 18, obligatoria: true },
    { clave: 'fechaIngreso', titulo: 'Fecha de ingreso', ancho: 16, texto: true, obligatoria: true, ayuda: 'AAAA-MM-DD' },
    { clave: 'puesto', titulo: 'Puesto', ancho: 18 },
    { clave: 'departamento', titulo: 'Departamento', ancho: 18 },
    { clave: 'telefono', titulo: 'Teléfono', ancho: 14, texto: true },
    { clave: 'correo', titulo: 'Correo', ancho: 24 },
    { clave: 'curp', titulo: 'CURP', ancho: 20, texto: true },
    { clave: 'rfc', titulo: 'RFC', ancho: 15, texto: true },
    { clave: 'nss', titulo: 'NSS', ancho: 13, texto: true },
    { clave: 'fechaNacimiento', titulo: 'Fecha de nacimiento', ancho: 18, texto: true, ayuda: 'AAAA-MM-DD' },
    { clave: 'precioHora', titulo: 'Precio por hora', ancho: 14, ayuda: 'Aplica a partir de la fecha de ingreso' }
];
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const POR_TITULO = new Map(COLUMNAS.map(c => [sinAcentos(c.titulo), c.clave]));
// Variantes comunes de encabezado.
for (const [t, k] of [['numero', 'numeroEmpleado'], ['no empleado', 'numeroEmpleado'], ['nombre', 'nombre'],
    ['nombres', 'nombre'], ['fecha ingreso', 'fechaIngreso'], ['fecha nacimiento', 'fechaNacimiento'],
    ['precio', 'precioHora'], ['telefono celular', 'telefono'], ['correo electronico', 'correo']]) POR_TITULO.set(t, k);

// ── Plantilla ────────────────────────────────────────────────────────────────

/** GET /api/empleados/getPlantillaImportacion — binario .xlsx (los errores, JSON). */
const getPlantillaImportacion = async (req, res) => {
    try {
        const cat = await catalogos(req);
        const sucursales = [...cat.sucursales.values()].filter(s => s.bActivo && cat.alcance.incluye(s.idSucursal)).map(s => s.nombre).sort();
        const puestos = [...cat.puestos.values()].filter(p => p.bActivo).map(p => p.nombre).sort();
        const departamentos = [...cat.departamentos.values()].filter(d => d.bActivo).map(d => d.nombre).sort();

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Truck Manager';
        const hoja = wb.addWorksheet('Empleados', { views: [{ state: 'frozen', ySplit: 1 }] });
        hoja.columns = COLUMNAS.map(c => ({ header: c.titulo, key: c.clave, width: c.ancho, style: c.texto ? { numFmt: '@' } : {} }));
        hoja.getRow(1).font = { bold: true };
        COLUMNAS.forEach((c, i) => {
            const celda = hoja.getRow(1).getCell(i + 1);
            const notas = [c.obligatoria ? 'Obligatoria.' : 'Opcional.', c.ayuda || ''].filter(Boolean).join(' ');
            celda.note = notas;
        });
        hoja.addRow({
            numeroEmpleado: EJEMPLO, nombre: 'María Fernanda', apellidoPaterno: 'López', apellidoMaterno: 'Ramírez',
            sucursal: sucursales[0] || 'Matriz', fechaIngreso: '2026-01-15', puesto: puestos[0] || 'Operador',
            departamento: departamentos[0] || '', telefono: '5512345678', correo: 'maria@ejemplo.com',
            curp: '', rfc: '', nss: '', fechaNacimiento: '', precioHora: 55.5
        }).font = { italic: true, color: { argb: 'FF808080' } };

        const cats = wb.addWorksheet('Catálogos');
        cats.columns = [{ header: 'Sucursales', width: 24 }, { header: 'Puestos', width: 24 }, { header: 'Departamentos', width: 24 }];
        cats.getRow(1).font = { bold: true };
        for (let i = 0; i < Math.max(sucursales.length, puestos.length, departamentos.length); i++) {
            cats.addRow([sucursales[i] ?? null, puestos[i] ?? null, departamentos[i] ?? null]);
        }
        const notas = wb.addWorksheet('Instrucciones');
        notas.getColumn(1).width = 110;
        [
            'Llena la hoja "Empleados", un empleado por renglón. El renglón con número EJEMPLO no se carga: bórralo o déjalo.',
            'Obligatorias: Nombre(s), Apellido paterno, Sucursal y Fecha de ingreso. Las fechas van como AAAA-MM-DD (2026-01-15).',
            'Sucursal: escríbela como aparece en la hoja "Catálogos". Puestos y departamentos que no existan se pueden crear al cargar.',
            'Número de empleado: si lo dejas vacío, el sistema pone el siguiente. No puede repetirse, ni con empleados dados de baja.',
            'CURP, RFC, NSS y fecha de nacimiento se cargan solo si tienes permiso de datos personales; el precio por hora, si tienes ese permiso.',
            'Antes de cargar verás qué renglones están bien y cuáles tienen error, con el motivo. Solo se cargan los correctos.'
        ].forEach(t => notas.addRow([t]));

        const buffer = await wb.xlsx.writeBuffer();
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="plantilla-empleados.xlsx"'
        });
        return res.send(Buffer.from(buffer));
    } catch (error) {
        return falla(res, 'getPlantillaImportacion', error, 'No fue posible generar la plantilla');
    }
};

// ── Lectura del Excel ────────────────────────────────────────────────────────

const dos = (n) => String(n).padStart(2, '0');

/** Valor de una celda de exceljs como texto. Las fechas de Excel vienen en UTC. */
const valorCelda = (v) => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return `${ v.getUTCFullYear() }-${ dos(v.getUTCMonth() + 1) }-${ dos(v.getUTCDate()) }`;
    if (typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map(x => x.text).join('');
        if ('result' in v) return valorCelda(v.result);
        if ('text' in v) return valorCelda(v.text);
        return '';
    }
    return String(v);
};

/** '2026-01-15', '15/01/2026', '15-01-2026' o el número de serie de Excel → 'AAAA-MM-DD' (o el texto tal cual, para que la validación lo rechace). */
const aFecha = (s) => {
    const t = String(s ?? '').trim();
    if (!t) return '';
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) { const [a, m, d] = t.split('-'); return `${ a }-${ dos(m) }-${ dos(d) }`; }
    const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) return `${ dmy[3] }-${ dos(dmy[2]) }-${ dos(dmy[1]) }`;
    if (/^\d{5}(\.\d+)?$/.test(t)) {
        // Serie de Excel: días desde 1899-12-30 (en UTC, sin zona: es una fecha, no un instante).
        const ms = Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86400000;
        const f = new Date(ms);
        return `${ f.getUTCFullYear() }-${ dos(f.getUTCMonth() + 1) }-${ dos(f.getUTCDate()) }`;
    }
    return t;
};

/** Lee el libro: [{ renglon, datos }] con las claves de COLUMNAS. Lanza Regla si no se puede usar. */
const leerExcel = async (buffer, maximo) => {
    const wb = new ExcelJS.Workbook();
    try {
        await wb.xlsx.load(buffer);
    } catch {
        throw new Regla('No se pudo leer el archivo. Guárdalo como Excel (.xlsx) y vuelve a intentarlo.');
    }
    const hoja = wb.getWorksheet('Empleados') || wb.worksheets[0];
    if (!hoja) throw new Regla('El archivo no tiene hojas');
    const columnas = new Map();
    hoja.getRow(1).eachCell((celda, col) => {
        const clave = POR_TITULO.get(sinAcentos(valorCelda(celda.value)));
        if (clave && ![...columnas.values()].includes(clave)) columnas.set(col, clave);
    });
    const faltan = COLUMNAS.filter(c => c.obligatoria && ![...columnas.values()].includes(c.clave)).map(c => c.titulo);
    if (faltan.length) throw new Regla(`Al archivo le faltan las columnas: ${ faltan.join(', ') }. Usa la plantilla.`);

    const filas = [];
    hoja.eachRow({ includeEmpty: false }, (row, numero) => {
        if (numero === 1) return;
        const datos = {};
        for (const c of COLUMNAS) datos[c.clave] = '';
        for (const [col, clave] of columnas) datos[clave] = valorCelda(row.getCell(col).value).trim();
        if (!Object.values(datos).some(Boolean)) return;
        if (datos.numeroEmpleado.toUpperCase() === EJEMPLO) return;
        datos.fechaIngreso = aFecha(datos.fechaIngreso);
        datos.fechaNacimiento = aFecha(datos.fechaNacimiento);
        filas.push({ renglon: numero, datos });
    });
    if (!filas.length) throw new Regla('El archivo no tiene empleados (el renglón EJEMPLO no cuenta)');
    if (filas.length > maximo) throw new Regla(`El archivo tiene ${ filas.length } empleados; el máximo por archivo es ${ maximo }`);
    return filas;
};

// ── La revisión (vista previa y carga) ───────────────────────────────────────

/**
 * Revisa los renglones con las reglas del alta (validarEmpleado). No guarda.
 *   modo 'vista': los catálogos faltantes son aviso si el usuario puede crearlos.
 *   modo 'carga': solo se aceptan si además pidió crearlos (crearCatalogos).
 * Regresa { renglones: [{ renglon, datos, empleado, errores, avisos }], seCrearan, puedeCrear }.
 */
const analizar = async (req, filas, { modo, crearCatalogos = false }, transaction) => {
    const cat = await catalogos(req, transaction);
    const puedeDP = puede(req, 'empleados_DatosPersonales');
    const puedePrecio = puede(req, 'empleados_Precio');
    const puedeCrear = { puestos: puede(req, 'puestos_CreateUpdate'), departamentos: puede(req, 'departamentos_CreateUpdate') };
    const seCrearan = { puestos: new Map(), departamentos: new Map() };

    // Números: repetidos dentro del archivo y los que se asignarán a los vacíos.
    const cuenta = new Map();
    for (const f of filas) {
        const n = texto(f.datos?.numeroEmpleado, 20)?.toLowerCase();
        if (n) cuenta.set(n, (cuenta.get(n) || 0) + 1);
    }
    const repetidos = new Set([...cuenta].filter(([, c]) => c > 1).map(([n]) => n));
    const mayorArchivo = Math.max(0, ...[...cuenta.keys()].filter(n => /^\d{1,15}$/.test(n)).map(Number));
    let siguiente = Math.max(Number(await siguienteNumero(req, transaction)), mayorArchivo + 1);
    const nombresArchivo = new Map();

    const renglones = [];
    for (const f of filas) {
        const crudo = {};
        for (const c of COLUMNAS) crudo[c.clave] = texto(f.datos?.[c.clave]) ?? '';
        const errores = [], avisos = [];
        const d = limpiar({
            numeroEmpleado: crudo.numeroEmpleado, nombre: crudo.nombre, apellidoPaterno: crudo.apellidoPaterno,
            apellidoMaterno: crudo.apellidoMaterno, fechaIngreso: aFecha(crudo.fechaIngreso), telefono: crudo.telefono,
            correo: crudo.correo, curp: crudo.curp, rfc: crudo.rfc, nss: crudo.nss, fechaNacimiento: aFecha(crudo.fechaNacimiento),
            idPuesto: null, idDepartamento: null, idUsuario: null
        });
        if (!puedeDP && CAMPOS_PERSONALES.some(k => d[k])) {
            avisos.push('No tienes permiso de datos personales: CURP, RFC, NSS y fecha de nacimiento no se cargan');
        }
        if (!puedeDP) for (const k of CAMPOS_PERSONALES) d[k] = null;

        if (!d.numeroEmpleado) {
            d.numeroEmpleado = String(siguiente++);
            avisos.push(`Sin número: se le asigna el ${ d.numeroEmpleado }`);
        }

        // Sucursal por nombre: principal y operativa iguales.
        let sinSucursal = false;
        if (crudo.sucursal) {
            const s = cat.sucursalesPorNombre.get(llaveNombre(crudo.sucursal));
            if (!s || !cat.alcance.incluye(s.idSucursal)) { errores.push(`La sucursal "${ crudo.sucursal }" no existe`); sinSucursal = true; }
            d.idSucursalPrincipal = d.idSucursalOperativa = s && cat.alcance.incluye(s.idSucursal) ? s.idSucursal : null;
        } else {
            d.idSucursalPrincipal = d.idSucursalOperativa = null;
        }

        // Puesto y departamento por nombre; los que no existen, "se crearán".
        const pendientes = {};
        for (const [campo, k, porNombre, lista, etiqueta] of [
            ['puesto', 'idPuesto', cat.puestosPorNombre, 'puestos', 'puesto'],
            ['departamento', 'idDepartamento', cat.departamentosPorNombre, 'departamentos', 'departamento']]) {
            const nombre = normalizar(crudo[campo]);
            if (!nombre) continue;
            if (nombre.length > 100) { errores.push(`El ${ etiqueta } "${ nombre.slice(0, 30) }…" es demasiado largo`); continue; }
            const x = porNombre.get(llaveNombre(nombre));
            if (x) { d[k] = x.id; continue; }
            const acepta = puedeCrear[lista] && (modo === 'vista' || crearCatalogos);
            if (!acepta) {
                errores.push(`El ${ etiqueta } "${ nombre }" no existe${ puedeCrear[lista] ? '' : ' y no tienes permiso para crearlo' }`);
                continue;
            }
            const llave = llaveNombre(nombre);
            if (!seCrearan[lista].has(llave)) seCrearan[lista].set(llave, nombre);
            pendientes[k] = llave;
            avisos.push(`El ${ etiqueta } "${ nombre }" no existe: se creará`);
        }

        // Precio por hora (a partir de la fecha de ingreso).
        let precioHora = null;
        if (crudo.precioHora) {
            if (!puedePrecio) avisos.push('No tienes permiso del precio por hora: no se carga');
            else {
                try { precioHora = validarPrecio(crudo.precioHora); } catch (e) { errores.push(e.message); }
            }
        }

        // LA regla del alta.
        const reglas = await validarEmpleado(req, d, { actual: null, cat, numerosLote: repetidos }, transaction);
        errores.push(...reglas.filter(m => !/sucursal operativa/.test(m) && !(sinSucursal && /sucursal principal/.test(m)))
            .map(m => m.replace('Falta la sucursal principal', 'Falta la sucursal')));

        // Posibles duplicados: aviso, no error.
        if (!errores.length && modo === 'vista') {
            const dup = await posiblesDuplicados(req, d, transaction);
            for (const p of dup.visibles) {
                avisos.push(`Posible duplicado (${ p.motivo }): ${ p.numeroEmpleado } ${ p.nombreCompleto }${ p.estado === 'BAJA' ? ', dado de baja' : '' }`);
            }
            if (dup.fuera) avisos.push(`Posible duplicado con ${ dup.fuera } empleado(s) de otras sucursales`);
            const llave = llaveNombre(d.nombre, d.apellidoPaterno, d.apellidoMaterno);
            if (nombresArchivo.has(llave)) avisos.push(`Mismo nombre que el renglón ${ nombresArchivo.get(llave) } del archivo`);
            else nombresArchivo.set(llave, f.renglon);
        }

        renglones.push({
            renglon: Number(f.renglon) || null,
            datos: crudo,
            empleado: { ...d, precioHora, pendientes, sucursal: crudo.sucursal },
            errores, avisos
        });
    }
    const lista = (m) => [...m.values()].sort((a, b) => a.localeCompare(b));
    return {
        renglones,
        seCrearan: { puestos: lista(seCrearan.puestos), departamentos: lista(seCrearan.departamentos) },
        puedeCrear
    };
};

/** POST /api/empleados/previsualizarImportacion (multipart: archivo) — no guarda nada. */
const previsualizarImportacion = async (req, res) => {
    try {
        const maximo = await constantes.valor('empleados.importacion_max', req);
        const filas = await leerExcel(req.archivo.buffer, maximo);
        const r = await analizar(req, filas, { modo: 'vista' });
        const renglones = r.renglones.map(x => ({
            // El número asignado viaja en los datos: lo que se ve es lo que se carga.
            renglon: x.renglon, datos: { ...x.datos, numeroEmpleado: x.empleado.numeroEmpleado }, numeroEmpleado: x.empleado.numeroEmpleado,
            nombreCompleto: [x.empleado.nombre, x.empleado.apellidoPaterno, x.empleado.apellidoMaterno].filter(Boolean).join(' '),
            sucursal: x.datos.sucursal, fechaIngreso: x.empleado.fechaIngreso,
            ok: !x.errores.length, errores: x.errores, avisos: x.avisos
        }));
        const correctos = renglones.filter(x => x.ok).length;
        return ok(res, `${ renglones.length } renglón(es): ${ correctos } correcto(s) y ${ renglones.length - correctos } con error`, {
            total: renglones.length, correctos, conError: renglones.length - correctos, maximo,
            seCrearan: r.seCrearan, puedeCrear: r.puedeCrear, renglones
        });
    } catch (error) {
        return falla(res, 'previsualizarImportacion', error, 'No fue posible revisar el archivo');
    }
};

/**
 * POST /api/empleados/importarEmpleados { renglones: [{ renglon, datos }], crearCatalogos }
 * Vuelve a validar todo; carga los correctos y regresa cuáles se rechazaron.
 */
const importarEmpleados = async (req, res) => {
    const entrada = Array.isArray(req.body.renglones) ? req.body.renglones : [];
    const crearCatalogos = req.body.crearCatalogos === true;
    try {
        const maximo = await constantes.valor('empleados.importacion_max', req);
        if (!entrada.length) return no(res, 'No hay renglones que cargar');
        if (entrada.length > maximo) return no(res, `Son ${ entrada.length } renglones; el máximo por carga es ${ maximo }`);
        const filas = entrada.map((x, i) => ({
            renglon: Number(x?.renglon) || i + 2,
            datos: x && typeof x.datos === 'object' && x.datos !== null ? x.datos : {}
        }));

        const resultado = await db.transaccion(async (t) => {
            const r = await analizar(req, filas, { modo: 'carga', crearCatalogos }, t);
            const buenos = r.renglones.filter(x => !x.errores.length);
            const rechazados = r.renglones.filter(x => x.errores.length).map(x => ({ renglon: x.renglon, errores: x.errores }));
            if (!buenos.length) return { cargados: 0, rechazados, creados: { puestos: [], departamentos: [] } };

            const plan = await permiteAlta(req, buenos.length);
            if (!plan.ok) throw new Regla(plan.mensaje, { codigo: 'LIMITE_PLAN' });

            // Catálogos que usan los renglones correctos.
            const creados = { puestos: [], departamentos: [] };
            const ids = { idPuesto: new Map(), idDepartamento: new Map() };
            for (const [k, lista, tabla] of [['idPuesto', 'puestos', 'puestos'], ['idDepartamento', 'departamentos', 'departamentos']]) {
                const usados = new Set(buenos.map(x => x.empleado.pendientes[k]).filter(Boolean));
                for (const llave of usados) {
                    const nombre = r.seCrearan[lista].find(n => llaveNombre(n) === llave);
                    const [id] = await db.empresa(req).query(
                        `INSERT INTO ${ tabla } (idEmpresa, nombre) VALUES (:idEmpresa, :nombre)`,
                        { replacements: { nombre }, type: QueryTypes.INSERT, transaction: t });
                    ids[k].set(llave, id);
                    creados[lista].push(nombre);
                }
            }

            for (const x of buenos) {
                const d = { ...x.empleado };
                for (const k of ['idPuesto', 'idDepartamento']) if (d.pendientes[k]) d[k] = ids[k].get(d.pendientes[k]);
                const { precioHora, pendientes, sucursal, ...datos } = d;
                void pendientes; void sucursal;
                const idEmpleado = await crearEmpleado(req, datos, 'IMPORTACION', t);
                if (precioHora) await guardarPrecio(req, { idEmpleado, precioHora, aPartirDe: datos.fechaIngreso }, t);
                // Análisis 006: como el alta, copia la plantilla de su sucursal y genera sus días.
                await prepararIngreso(req, idEmpleado, datos.fechaIngreso, t, { copiarPlantilla: true });
            }
            return { cargados: buenos.length, rechazados, creados };
        });
        const msg = `${ resultado.cargados } empleado(s) cargado(s)`
            + (resultado.rechazados.length ? `; ${ resultado.rechazados.length } renglón(es) rechazado(s)` : '');
        return ok(res, msg, resultado);
    } catch (error) {
        if (error?.original?.errno === 1062) return no(res, 'Otro usuario dio de alta un número del archivo mientras tanto. Vuelve a revisar el archivo.');
        return falla(res, 'importarEmpleados', error, 'No fue posible cargar los empleados');
    }
};

module.exports = { getPlantillaImportacion, previsualizarImportacion, importarEmpleados, COLUMNAS };
