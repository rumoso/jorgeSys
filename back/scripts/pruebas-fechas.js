#!/usr/bin/env node
// =============================================================================
// Pruebas del ayudante de fechas (análisis 003 §5). Sin base de datos.
//     npm run pruebas:fechas
//
// Corre el juego completo tres veces, con el proceso en zonas distintas
// (UTC, Tijuana y Tokio): el resultado debe ser el mismo, porque ninguna
// fecha de negocio depende del reloj del proceso.
// =============================================================================

const { spawnSync } = require('child_process');

const ZONAS_PROCESO = ['UTC', 'America/Tijuana', 'Asia/Tokyo'];

if (!process.env.PRUEBAS_FECHAS_HIJO) {
    let fallas = 0;
    const salidas = [];
    for (const tz of ZONAS_PROCESO) {
        const r = spawnSync(process.execPath, [__filename], {
            env: { ...process.env, TZ: tz, PRUEBAS_FECHAS_HIJO: '1' }, encoding: 'utf8'
        });
        console.log(`── Proceso con TZ=${ tz } ──`);
        process.stdout.write(r.stdout);
        if (r.stderr) process.stderr.write(r.stderr);
        if (r.status !== 0) fallas++;
        salidas.push(r.stdout.split('\n').filter(l => l.startsWith('✔') || l.startsWith('✘')).join('\n'));
    }
    const iguales = salidas.every(s => s === salidas[0]);
    console.log(iguales ? '✔ Los tres procesos dieron exactamente lo mismo' : '✘ El resultado cambió con la zona del proceso');
    process.exit(fallas || !iguales ? 1 : 0);
}

// ── Juego de pruebas (proceso hijo) ──────────────────────────────────────────

const f = require('../helpers/fechas');

const malos = [];
let total = 0;
const revisar = (nombre, ok, detalle = '') => {
    total++;
    if (!ok) malos.push(nombre);
    console.log(`${ ok ? '✔' : '✘' } ${ nombre }${ !ok && detalle ? `  → ${ detalle }` : '' }`);
};
const iso = (d) => d.toISOString();

const TIJ = 'America/Tijuana';     // con horario de verano
const CDMX = 'America/Mexico_City'; // sin horario de verano desde 2022
const MZT = 'America/Mazatlan';

// 1. 23:30 en Tijuana pertenece a ese día, aunque en UTC y en CDMX ya sea el siguiente.
let x = f.aInstante('2026-06-10', '23:30', TIJ);
revisar('23:30 en Tijuana (verano) es 06:30 UTC del día siguiente', iso(x.instante) === '2026-06-11T06:30:00.000Z', iso(x.instante));
revisar('→ pertenece al 10 en Tijuana', f.diaDe(x.instante, TIJ) === '2026-06-10');
revisar('→ en Ciudad de México ya es el 11', f.diaDe(x.instante, CDMX) === '2026-06-11');
x = f.aInstante('2026-01-15', '23:30', TIJ);
revisar('23:30 en Tijuana (invierno) es 07:30 UTC y sigue siendo el 15', iso(x.instante) === '2026-01-16T07:30:00.000Z' && f.diaDe(x.instante, TIJ) === '2026-01-15');

// 2. Medianoche exacta.
let d = f.limitesDia('2026-06-10', CDMX);
revisar('el día en CDMX empieza a las 06:00 UTC', iso(d.inicio) === '2026-06-10T06:00:00.000Z', iso(d.inicio));
revisar('medianoche exacta pertenece al día que empieza', f.diaDe(d.inicio, CDMX) === '2026-06-10');
revisar('un milisegundo antes es el día anterior', f.diaDe(new Date(d.inicio.getTime() - 1), CDMX) === '2026-06-09');
revisar('el fin del día es el inicio del siguiente', f.diaDe(d.fin, CDMX) === '2026-06-11' && d.horas === 24);
x = f.aInstante('2026-06-10', '00:00', CDMX);
revisar('00:00 local convertido y de regreso', f.aLocal(x.instante, CDMX).hora === '00:00' && f.aLocal(x.instante, CDMX).fecha === '2026-06-10');

// 3. Los dos días de cambio de horario en Tijuana (2026: 8 de marzo y 1 de noviembre).
d = f.limitesDia('2026-03-08', TIJ);
revisar('8 de marzo en Tijuana dura 23 horas', d.horas === 23, String(d.horas));
d = f.limitesDia('2026-11-01', TIJ);
revisar('1 de noviembre en Tijuana dura 25 horas', d.horas === 25, String(d.horas));
revisar('→ el 1 de noviembre termina a las 08:00 UTC del 2', iso(d.fin) === '2026-11-02T08:00:00.000Z', iso(d.fin));
x = f.aInstante('2026-03-08', '02:30', TIJ);
revisar('02:30 del 8 de marzo no existe: se toma la siguiente hora válida (03:30) y se avisa',
    x.ajuste === 'NO_EXISTE' && f.aLocal(x.instante, TIJ).hora === '03:30', `${ x.ajuste } ${ f.aLocal(x.instante, TIJ).hora }`);
x = f.aInstante('2026-11-01', '01:30', TIJ);
revisar('01:30 del 1 de noviembre se repite: se toma la primera (08:30 UTC) y se avisa',
    x.ajuste === 'REPETIDA' && iso(x.instante) === '2026-11-01T08:30:00.000Z', `${ x.ajuste } ${ iso(x.instante) }`);
x = f.aInstante('2026-11-01', '03:30', TIJ);
revisar('03:30 del 1 de noviembre es normal', x.ajuste === null && iso(x.instante) === '2026-11-01T11:30:00.000Z');
d = f.limitesDia('2026-03-08', CDMX);
revisar('en CDMX el 8 de marzo dura 24 horas (sin horario de verano)', d.horas === 24);

// 4. Semana que cruza de mes, con distintos días de inicio.
let s = f.limitesSemana('2026-10-01', CDMX, 1);
revisar('semana del jueves 1 de octubre, empezando en lunes: 28 sep a 4 oct',
    s.desde === '2026-09-28' && s.hasta === '2026-10-04', `${ s.desde } a ${ s.hasta }`);
s = f.limitesSemana('2026-10-01', CDMX, 7);
revisar('empezando en domingo: 27 sep a 3 oct', s.desde === '2026-09-27' && s.hasta === '2026-10-03', `${ s.desde } a ${ s.hasta }`);
s = f.limitesSemana('2026-10-01', CDMX, 4);
revisar('empezando en jueves, el mismo jueves abre la semana', s.desde === '2026-10-01' && s.hasta === '2026-10-07');
s = f.limitesSemana('2026-12-31', CDMX, 1);
revisar('semana que cruza de año', s.desde === '2026-12-28' && s.hasta === '2027-01-03');
s = f.limitesSemana('2026-11-01', TIJ, 1);
revisar('semana con cambio de horario en Tijuana dura 7 días y 1 hora',
    (s.fin - s.inicio) / 3600000 === 169, String((s.fin - s.inicio) / 3600000));

// 5. Dos sucursales en zonas distintas.
const mismo = new Date('2026-06-11T05:30:00.000Z');
revisar('el mismo instante es el 10 en Tijuana y en Mazatlán, y el 10 en CDMX',
    f.diaDe(mismo, TIJ) === '2026-06-10' && f.diaDe(mismo, MZT) === '2026-06-10' && f.diaDe(mismo, CDMX) === '2026-06-10');
const otro = new Date('2026-06-11T06:30:00.000Z');
revisar('una hora después: sigue el 10 en Tijuana y Mazatlán, ya es el 11 en CDMX',
    f.diaDe(otro, TIJ) === '2026-06-10' && f.diaDe(otro, MZT) === '2026-06-10' && f.diaDe(otro, CDMX) === '2026-06-11');
revisar('la hora local de ese instante: 23:30 en Tijuana, 23:30 en Mazatlán, 00:30 en CDMX',
    f.aLocal(otro, TIJ).hora === '23:30' && f.aLocal(otro, MZT).hora === '23:30' && f.aLocal(otro, CDMX).hora === '00:30');

// 6. Formatos de entrada y errores.
revisar('lee el texto que regresa MySQL (UTC, sin zona)', f.diaDe('2026-06-11 06:30:00', TIJ) === '2026-06-10');
let lanzo = false;
try { f.diaDe(mismo, 'UTC-7'); f.diaDe(mismo, 'Marte/Olympus'); } catch { lanzo = true; }
revisar('una zona inválida lanza error', lanzo);
lanzo = false;
try { f.limitesDia('2026-02-30', CDMX); } catch { lanzo = true; }
revisar('una fecha inválida lanza error', lanzo);
revisar('sumar días cruza meses sin instantes', f.sumarDias('2026-01-31', 1) === '2026-02-01');

console.log(malos.length ? `✘ ${ malos.length } de ${ total } fallaron` : `✔ Ayudante de fechas: ${ total } de ${ total }`);
process.exit(malos.length ? 1 : 0);
