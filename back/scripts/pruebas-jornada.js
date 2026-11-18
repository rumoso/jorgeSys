#!/usr/bin/env node
// =============================================================================
// Pruebas del cálculo de la jornada (análisis 006 §5 y §6), sin base de datos
//     npm run pruebas:jornada
// =============================================================================
const { calcularDia, maximoDiario, avisoDia, avisosSemana, validarDia, dentroDelTurno } = require('../helpers/jornada');

let total = 0;
const malos = [];
const revisar = (nombre, ok, detalle = '') => {
    total++;
    if (!ok) malos.push(nombre);
    console.log(`${ ok ? '✔' : '✘' } ${ nombre }${ !ok && detalle ? `  → ${ detalle }` : '' }`);
};
const j = (x) => JSON.stringify(x);

// ── Horas y tipo ──
let r = calcularDia({ entrada: '09:00', salida: '18:00', comidaMinutos: 60, bComidaDentro: false });
revisar('9:00–18:00 con 60 min descontados = 8 h diurna', r.horas === 8 && r.tipoJornada === 'DIURNA' && !r.bCruzaMedianoche, j(r));

r = calcularDia({ entrada: '09:00', salida: '18:00', comidaMinutos: 60, bComidaDentro: true });
revisar('comida dentro de la jornada no descuenta (9 h)', r.horas === 9, j(r));

r = calcularDia({ entrada: '22:00:00', salida: '06:00:00', comidaMinutos: 0 });
revisar('22:00–6:00 = 8 h nocturna y cruza la medianoche', r.horas === 8 && r.tipoJornada === 'NOCTURNA' && r.bCruzaMedianoche
    && r.minutosNocturnos === 480, j(r));
const noche = { estado: 'LABORABLE', diaSemana: 1, ...r };
const aviso = avisoDia(noche);
revisar('→ con aviso de máximo 7 h', aviso?.tipo === 'DIARIO' && aviso.maximo === 7 && aviso.horas === 8 && /Lunes/.test(aviso.mensaje), j(aviso));

r = calcularDia({ entrada: '14:00', salida: '22:00' });
revisar('14:00–22:00 = mixta (2 h nocturnas)', r.tipoJornada === 'MIXTA' && r.minutosNocturnos === 120 && r.horas === 8, j(r));

r = calcularDia({ entrada: '16:00', salida: '23:30' });
revisar('16:00–23:30 = nocturna por las 3.5 h', r.tipoJornada === 'NOCTURNA' && r.minutosNocturnos === 210, j(r));

r = calcularDia({ entrada: '16:00', salida: '23:29' });
revisar('16:00–23:29 = mixta (3 h 29 min nocturnas)', r.tipoJornada === 'MIXTA', j(r));

r = calcularDia({ entrada: '05:00', salida: '13:00' });
revisar('5:00–13:00 = mixta (1 h nocturna de madrugada)', r.tipoJornada === 'MIXTA' && r.minutosNocturnos === 60, j(r));

r = calcularDia({ entrada: '06:00', salida: '20:00' });
revisar('6:00–20:00 = diurna (los bordes no son noche)', r.tipoJornada === 'DIURNA' && r.horas === 14, j(r));

r = calcularDia({ entrada: '20:00', salida: '06:00' });
revisar('20:00–6:00 = nocturna, 10 h', r.tipoJornada === 'NOCTURNA' && r.horas === 10 && r.bCruzaMedianoche, j(r));

r = calcularDia({ entrada: '09:00', salida: '17:30', comidaMinutos: 30 });
revisar('horas con decimales (8 h)', r.horas === 8, j(r));
r = calcularDia({ entrada: '09:00', salida: '17:20', comidaMinutos: 0 });
revisar('8 h 20 min = 8.33 h', r.horas === 8.33, j(r));

revisar('máximos diarios 8 / 7.5 / 7', maximoDiario('DIURNA') === 8 && maximoDiario('MIXTA') === 7.5 && maximoDiario('NOCTURNA') === 7);

// ── Avisos de la semana ──
const semana = [1, 2, 3, 4, 5, 6].map(d => ({ diaSemana: d, estado: 'LABORABLE', ...calcularDia({ entrada: '08:00', salida: '17:00' }) }));
semana.push({ diaSemana: 7, estado: 'DESCANSO', horas: 0, tipoJornada: null });
let avisos = avisosSemana(semana, 48);
const diarios = avisos.filter(a => a.tipo === 'DIARIO');
const semanal = avisos.find(a => a.tipo === 'SEMANAL');
revisar('aviso diario por cada día de 9 h (máximo 8)', diarios.length === 6 && diarios.every(a => a.maximo === 8 && a.horas === 9), j(diarios));
revisar('aviso semanal: 54 h contra el máximo de la constante (48)', semanal?.horas === 54 && semanal.maximo === 48, j(semanal));
avisos = avisosSemana(semana, 60);
revisar('con máximo semanal de 60 no hay aviso semanal', !avisos.some(a => a.tipo === 'SEMANAL'), j(avisos));
const ocho = [1, 2, 3, 4, 5, 6].map(d => ({ diaSemana: d, estado: 'LABORABLE', ...calcularDia({ entrada: '09:00', salida: '18:00', comidaMinutos: 60 }) }));
revisar('6 días de 8 h = 48 h: sin avisos', avisosSemana(ocho, 48).length === 0, j(avisosSemana(ocho, 48)));
revisar('un descanso no avisa', avisoDia({ estado: 'DESCANSO', horas: 0 }) === null);

// ── Validación ──
const v = (d) => validarDia({ diaSemana: 1, ...d });
revisar('día laborable válido', v({ estado: 'LABORABLE', entrada: '09:00', salida: '18:00', comidaMinutos: 60, bComidaDentro: false }).length === 0);
revisar('turno nocturno válido', v({ estado: 'LABORABLE', entrada: '22:00', salida: '06:00', comidaMinutos: 30 }).length === 0);
revisar('rechaza una hora sin formato', v({ estado: 'LABORABLE', entrada: '9', salida: '18:00' }).some(e => /entrada/.test(e)));
revisar('rechaza 24:00', v({ estado: 'LABORABLE', entrada: '08:00', salida: '24:00' }).some(e => /salida/.test(e)));
revisar('rechaza entrada igual a la salida', v({ estado: 'LABORABLE', entrada: '08:00', salida: '08:00' }).some(e => /iguales/.test(e)));
revisar('rechaza comida negativa', v({ estado: 'LABORABLE', entrada: '08:00', salida: '16:00', comidaMinutos: -5 }).length === 1);
revisar('rechaza comida igual o mayor al turno', v({ estado: 'LABORABLE', entrada: '08:00', salida: '09:00', comidaMinutos: 60 }).some(e => /menor que el turno/.test(e)));
revisar('rechaza descanso con horas', v({ estado: 'DESCANSO', entrada: '08:00', salida: '16:00' }).some(e => /descanso no lleva/.test(e)));
revisar('descanso sin horas es válido', v({ estado: 'DESCANSO', entrada: null, salida: null }).length === 0);
revisar('rechaza un estado desconocido', v({ estado: 'FERIADO' }).length === 1);

// ── Hora dentro del turno (cobertura) ──
revisar('13:00 cae dentro de 9:00–18:00', dentroDelTurno('09:00', '18:00', '13:00'));
revisar('18:00 no cae dentro de 9:00–18:00', !dentroDelTurno('09:00', '18:00', '18:00'));
revisar('2:00 cae dentro de 22:00–6:00', dentroDelTurno('22:00', '06:00', '02:00'));
revisar('7:00 no cae dentro de 22:00–6:00', !dentroDelTurno('22:00', '06:00', '07:00'));

console.log(malos.length ? `\n✘ ${ malos.length } de ${ total } fallaron` : `\n✔ Jornada: ${ total } de ${ total }`);
process.exit(malos.length ? 1 : 0);
