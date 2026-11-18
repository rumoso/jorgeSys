const { Sequelize } = require('sequelize');

const numeroEnv = (nombre, porDefecto) => {
    const n = Number(process.env[nombre]);
    return Number.isFinite(n) && process.env[nombre] !== '' && process.env[nombre] !== undefined ? n : porDefecto;
};

const dbConnection = new Sequelize(process.env.DATABASE, process.env.USERDB, process.env.PASSWORD, {
    host: process.env.SERVER,
    // PORT_MYSQL es el nombre documentado; PORT_SQL se acepta porque es el
    // que traen algunos .env (y Diprolim). Sin ninguno, mysql2 usa 3306.
    port: process.env.PORT_MYSQL || process.env.PORT_SQL,
    dialect: process.env.DATABASE_TYPE,
    define: { freezeTableName: true },
    // Analisis 060. Antes: default de Sequelize (5 conexiones, 60 s de espera).
    // Cada peticion protegida ya hace 2 consultas antes de su logica (usuario
    // y permisos), y el panel del director dispara varias en paralelo. Valores
    // por default tomados de Diprolim; max_connections de MySQL es 151.
    pool: {
        max:     numeroEnv('DB_POOL_MAX', 15),
        min:     numeroEnv('DB_POOL_MIN', 0),
        acquire: numeroEnv('DB_POOL_ACQUIRE_MS', 30000),
        idle:    numeroEnv('DB_POOL_IDLE_MS', 10000)
    },
    // Reintenta errores transitorios de conexion (no de SQL) antes de fallar.
    retry: { max: 3 },
    // Apagado por default: escribir cada consulta al log de pm2 es I/O
    // constante y mete datos del negocio en el archivo. SQL_LOG=true para
    // depurar sin tocar codigo.
    logging: process.env.SQL_LOG === 'true' ? console.log : false,
    timezone: '+00:00',   // UTC: la zona de negocio es por sucursal
    dialectOptions: {
    // opcional: evitar que mysql2 haga conversiones raras
      dateStrings: true,
      typeCast: true
    }
  });

module.exports={
    dbConnection
}