# SQL

Un script por análisis: `NNN_slug.sql`, idempotente y con rollback al final
(misma regla que AgroEnvases). Toda tabla de datos de empresa lleva
`idEmpresa` (ARQUITECTURA §3, LP-1).

**Ajuste nuevo de la configuración de la empresa** (análisis 003): una fila
en `cat_configuracion_ajustes` en el script del análisis que lo usa, seguida
de `CALL sp_preparar_configuracion(NULL);` para que cada empresa lo reciba
con su valor inicial, marcado como "revísalo". La pantalla no se toca.

**Panel del superadministrador** (análisis 009):
- `009_superadministrador_y_planes.sql` se corre como los demás (usuario de
  la aplicación, `node scripts/aplicar-sql.js ../SQL/009_…`). Crea las tablas
  del panel (`superadmins`, `cat_planes`, `bitacora_producto`, sin
  `idEmpresa`), las de empresa del 009, las constantes del grupo Panel y el
  plan `Sin límite` para las empresas que ya existen.
- `009b_bitacora_producto_inmutable.sql` (disparadores que rechazan `UPDATE`
  y `DELETE` en `bitacora_producto`) se corre **una vez, después del 009, con
  el usuario administrador de MySQL**: con el binlog encendido, crear un
  disparador exige SUPER y el usuario de la aplicación no lo tiene.

      mysql -u root -p db_truck_manager < SQL/009b_bitacora_producto_inmutable.sql
