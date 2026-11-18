#!/usr/bin/env node
// Aplica un script de SQL/ sobre la base del .env (local o pruebas).
//     node scripts/aplicar-sql.js ../SQL/001_esqueleto_multiempresa.sql
//
// Entiende `DELIMITER` como el cliente de MySQL y Workbench, para que el
// mismo archivo con procedimientos sirva en los dos lados.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const mysql = require('mysql2/promise');

/** Parte el script en sentencias respetando DELIMITER, comillas y comentarios. */
const sentencias = (texto) => {
    const out = [];
    let delim = ';';
    let actual = '';
    for (const linea of texto.split(/\r?\n/)) {
        const m = linea.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
        if (m) {
            if (actual.trim()) out.push(actual);
            actual = '';
            delim = m[1];
            continue;
        }
        actual += linea + '\n';
        // Cierra la sentencia cuando la línea termina con el delimitador
        // vigente (fuera de un comentario de línea).
        const sinComentario = linea.replace(/--\s.*$/, '').trimEnd();
        if (sinComentario.endsWith(delim)) {
            const idx = actual.lastIndexOf(delim);
            out.push(actual.slice(0, idx));
            actual = '';
        }
    }
    if (actual.trim()) out.push(actual);
    return out
        .map(s => s.trim())
        .filter(s => s && !/^(--[^\n]*\n?\s*)+$/.test(s + '\n'));
};

(async () => {
    const archivo = process.argv[2];
    if (!archivo || !fs.existsSync(archivo)) {
        console.error('Uso: node scripts/aplicar-sql.js <archivo.sql>');
        process.exit(1);
    }
    const conn = await mysql.createConnection({
        host: process.env.SERVER,
        port: Number(process.env.PORT_MYSQL || process.env.PORT_SQL || 3306),
        user: process.env.USERDB,
        password: process.env.PASSWORD,
        database: process.env.DATABASE
    });
    try {
        const lista = sentencias(fs.readFileSync(archivo, 'utf8'));
        for (const s of lista) {
            try {
                await conn.query(s);
            } catch (e) {
                console.error(`✘ Falló:\n${ s.slice(0, 300) }\n→ ${ e.message }`);
                process.exit(1);
            }
        }
        console.log(`Aplicado: ${ archivo } en ${ process.env.DATABASE } (${ lista.length } sentencias)`);
    } finally {
        await conn.end();
    }
})().catch(e => { console.error(e.message); process.exit(1); });
