# Instrucciones de código — Truck Manager (multiempresa)

## Objetivo
Estas instrucciones definen cómo debe colaborar GitHub Copilot en este repositorio para mantener consistencia técnica y funcional entre `back/`, `front/` y `SQL/`.

## Contexto del proyecto
- Backend: Node.js + Express + Sequelize. Entry point: `back/app.js` y `back/models/server.js`.
  - Capas: `back/routes` -> `back/controllers` -> `back/models` (o querys literales, ver abajo).
  - Middlewares en `back/middlewares`; helpers reutilizables en `back/helpers`; logs en `back/logs/`.
  - Acciones a nivel sistema (no atadas a un módulo de negocio, p. ej. permisos o preferencias de usuario) van en `back/routes/global.js` + `back/controllers/global.js`.
- Frontend: Angular 17+ standalone components (SIN NgModules) con Angular Material.
  - Componentes por feature bajo `front/src/app/features/<área>/<entidad>/`, con sus modales en un subdirectorio `mdl/`.
  - Servicios en `front/src/app/core/services/` (barrel `index.ts`); modelos/interfaces en `front/src/app/models/`.
  - Rutas de cada área en `<área>.routes.ts` (lazy-loaded vía `loadComponent`).
- Base de datos: MySQL. Motor de diseño: MySQL Workbench (`.mwb`). Scripts en `SQL/`.

## Multiempresa (ARQUITECTURA §3, ley de piedra LP-1) — antes que todo
- Toda tabla de datos de una empresa lleva `idEmpresa` (y sus `UNIQUE` y
  referencias lo incluyen). Lo global del producto (catálogo de menús,
  acciones, módulos, festivos oficiales, tipos de ausencia de ley, defaults de
  constantes) no lo lleva.
- La empresa sale **siempre** del token (`req.idEmpresa`, lo pone
  `validarJWT`). Nunca se acepta `idEmpresa` del body, query ni params.
- **Consultar solo con `back/helpers/db.js`**, nunca con `dbConnection`:
  `db.empresa(req).query(...)` para tablas de empresa (exige `:idEmpresa` y
  lo llena con el de la sesión), `db.global.query(...)` para las globales y
  `db.sinEmpresa.query(...)` solo para lo que cruza empresas a propósito,
  con `/* sin-empresa: motivo */` dentro del SQL. Toda tabla nueva se
  declara en `back/helpers/tablasEmpresa.js` en la misma entrega.
- Antes de cerrar una tarea: `npm run auditar` (permisos + empresa) y
  `npm run fuga`, que se extiende con los endpoints nuevos.
- Toda consulta a una tabla de empresa filtra por `:idEmpresa`; un id que no
  es de la empresa de la sesión responde "no existe" (no "sin permiso").
- Las cachés en memoria llevan la empresa en la llave.
- Fechas de negocio: por la zona horaria de la sucursal, nunca por el reloj
  del proceso (corre en UTC). En el Back, **solo con `helpers/fechas.js`**
  (`hoy`, `diaDe`, `limitesDia`, `limitesSemana`, `aInstante`, `aLocal`,
  `zonaDeSucursal`); `npm run auditar` incluye `auditar-fechas.js`, que
  falla con `CURDATE()`, `NOW()`, métodos locales de `Date` o
  `toLocale…String` sin zona. Una excepción lleva `/* fecha-ok: motivo */`.
  Las pruebas: `npm run pruebas:fechas` (sin base, en tres zonas de proceso).
- El guardián de consultas y las pruebas de fuga entre empresas se corren
  antes de dar por terminada una tarea.

## Panel del superadministrador (análisis 009) — la única excepción a LP-1
- Es **otro sistema dentro del mismo API**: el superadministrador no es un
  usuario de empresa (`superadmins`, con segundo factor). Nada del panel se
  llama desde una sesión de empresa, ni al revés.
- **Carpetas propias**: `back/routes/panel/`, `back/controllers/panel/`,
  `back/helpers/panel/` y `front/src/app/features/panel/`. Rutas bajo
  `/api/panel/...` (`this.paths.panelXxx` en `models/server.js`). El
  guardián (`auditar-empresa.js`) falla si una ruta de empresa importa un
  controlador del panel o al revés, o si una tabla del panel aparece fuera
  de esas carpetas.
- **Sesión**: token propio en la cabecera **`x-token-panel`** (nunca
  `x-token`), validado por `validarPanel` (`middlewares/validar-panel.js`):
  pone `req.idSuperadmin` y `req.superadmin`, **nunca** `req.idEmpresa`; si
  falla, 401 `SESION_PANEL_INVALIDA`. Toda ruta del panel (salvo `auth/login`)
  lleva `validarPanel` y **no** `validarJWT` ni `validarAccion`
  (`auditar-permisos.js` lo revisa). La empresa sobre la que se actúa sí
  viaja en el body o el query: el panel la escoge.
- **Consultas**:
  - `db.panel(req).query(...)`: lo normal en el panel; es el único que toca
    `TABLAS_PANEL` (`superadmins`, `cat_planes`, `bitacora_producto`,
    declaradas en `helpers/tablasEmpresa.js`; `db.empresa`, `db.global` y
    `db.sinEmpresa` fallan si las mencionan). Si toca una tabla de empresa,
    lleva `/* panel: motivo */` en el SQL y el guardián la lista. Solo en
    `controllers/panel/`, `helpers/panel/` y `scripts/`;
  - `db.panelAcceso.query(...)`: solo el login (aún no hay
    `req.idSuperadmin`); solo lee `superadmins`;
  - `db.planDeEmpresa(req).query(...)`: el plan vigente de la empresa **de la
    sesión** (límite y aviso del plan), solo `SELECT` sobre `empresas_planes`
    y `cat_planes` con `:idEmpresa`; solo en `helpers/panel/plan.js`
    (`planVigente`).
  - Las tablas de empresa del 009 (`empresas_planes`, `empresas_historial`,
    `soporte_sesiones`…) fuera del panel se leen con `db.empresa(req)` y
    `:idEmpresa`, como cualquier otra.
- **Bitácora del producto**: toda escritura del panel llama a
  `bitacoraProducto.registrar(req, { accion, idEmpresa, objeto, antes,
  despues, motivo }, t)` (`helpers/panel/bitacoraProducto.js`) **dentro de su
  transacción**. `bitacora_producto` no se actualiza ni se borra
  (disparadores de `SQL/009b`; el guardián falla si el código lo intenta).
- **Sesión de soporte** (el superadministrador dentro de una empresa): token
  `soporte` en `x-token`, como una sesión de empresa; `validarJWT` lo acepta
  con `req.soporte` (`idSesionSoporte`, nombre…), **`req.uid = null`** y
  todas las sucursales. Todo lo que guarda un autor usa `req.uid ?? null` y
  las bitácoras de la empresa guardan `req.soporte?.idSesionSoporte`. Lo
  personal (Mi cuenta, contraseña, preferencias) lleva el middleware
  `sinSoporte` (responde `NO_APLICA_SOPORTE`).
- **Baja definitiva**: **toda tabla nueva de empresa se declara también en
  `helpers/panel/tablasBaja.js`**: en `SE_EXPORTAN` o `NO_SE_EXPORTAN` (con
  motivo) y en `ORDEN_BORRADO` o `SE_CONSERVAN`. `auditar-baja.js` (en `npm
  run auditar`) falla si falta.
- **Front**: `features/panel/` con su marco `layouts/panel-shell` y servicios
  en `core/services/panel/` (barrel propio, no el de la empresa).
  `PanelAuthService` guarda su token aparte (`rh_panel_token`); el
  interceptor manda `x-token-panel` solo a `/api/panel/` y `x-token` solo al
  resto, y un 401 del panel regresa a `/panel/entrar` (`panelGuard`,
  `noPanelGuard`). **Modo soporte**: la sesión de soporte vive en
  `sessionStorage` (solo esa pestaña) y manda sobre la normal
  (`AuthService.modoSoporte`, `soporte()`); se muestra la barra "Sesión de
  soporte en …" y no se ofrece lo personal (`noSoporteGuard`).
- **Pruebas**: `npm run pruebas:panel` (necesita la demo con su
  superadministrador, `instalar.js --demo`) y `npm run fuga`, que recorre los
  routers reales: una ruta nueva del panel entra sola a la prueba de 401.

## Reglas generales
1. Aplicar cambios mínimos y enfocados al requerimiento solicitado.
2. No renombrar archivos, rutas o símbolos públicos salvo que sea estrictamente necesario.
3. No modificar código no relacionado con la tarea.
4. Respetar patrones ya existentes del módulo afectado.
5. Evitar dependencias nuevas si ya existe solución equivalente en el proyecto.
6. No incluir secretos, credenciales ni datos sensibles en código, logs o commits.
7. No versionar binarios ni archivos generados: `back/uploads/`, `*.log`, `~$*`, `*.bak` deben estar en `.gitignore`.

## Backend (`back/`)
- Flujo por capas: `route` valida los parámetros obligatorios (nunca reglas de
  negocio) -> `controller` ejecuta la operación y las reglas de negocio.
- Reusar middlewares existentes antes de crear nuevos (`validar-jwt.js`,
  `validar-accion.js`).
- Rutas por **nombre de acción**, no REST puro, todas bajo la base del
  módulo: `GET .../getEntidad`, `POST .../insertUpdateEntidad` (sin id
  inserta, con id actualiza), `DELETE .../deleteEntidad` (o `PUT
  .../disableEntidad` si la entidad separa eliminación lógica de
  permanente). Registrar la ruta en `back/routes` y el router en
  `back/models/server.js` (`this.paths.xxx` + `this.app.use(...)`).
- **Un endpoint por regla de negocio: ante la duda, crear uno nuevo.**
  Reutilizar un endpoint existente para un caso de uso distinto es la
  excepción, y hay que **justificarla explícitamente**; crear uno nuevo es
  el default. Un endpoint no es solo "de dónde salen los datos": arrastra
  su **filtro, su orden, su tope de resultados, su permiso y su forma de
  respuesta**, y esas son decisiones de negocio del caso para el que se
  escribió. Al reutilizarlo en otro contexto, esas decisiones viajan calladas
  y el bug aparece en producción, no al compilar.

  Antes de reutilizar uno, responder las cinco: **(1)** ¿el filtro busca en
  las mismas columnas que necesito? **(2)** ¿el orden y el tope de
  resultados me sirven, o pueden dejar fuera el registro que busco?
  **(3)** ¿el permiso que exige (`validarAccion`) lo tienen los roles que
  van a usar mi pantalla? **(4)** ¿me devuelve el juego **completo** de
  columnas que voy a escribir de vuelta? **(5)** ¿su contrato de respuesta
  significa lo mismo en mi contexto? Si alguna respuesta es "no" o "más o
  menos", **es endpoint nuevo**.

  Reutilizar sí aplica cuando es la **misma entidad, la misma regla y el
  mismo permiso**, y solo cambia quién lo llama (ej. el mismo PDF de una
  cotización descargado desde el modal o desde el grid).

  Casos reales que costaron bugs (todos por reciclar `buscarCatClientes`):
  buscar **por teléfono** con una búsqueda que también matchea
  nombre/RFC/razón social y corta a 5 resultados por nombre → reportaba
  "cliente no encontrado" con el cliente ya registrado; y traer un cliente
  **por id** buscándolo por nombre → cuando el nombre quedaba fuera del
  recorte se armaba un objeto incompleto que, al guardarse desde el modal
  de edición, **borraba** teléfono, domicilio y datos de crédito. Hoy son
  tres endpoints distintos: `buscarCatClientes` (combo por nombre),
  `buscarClientePorTelefono` y `getCatClienteById`.

  Aplica igual a **modales y componentes compartidos**: si se cambia su
  contrato de entrada/salida, hay que revisar **todos** sus consumidores
  (`grep` del componente), porque TypeScript no siempre atrapa un
  `close(...)` que cambió de forma.
- **Respuesta estándar — TODOS los endpoints nuevos, sin excepción:**
  `{ status_code, message, data }`, siempre devuelta con **`res.json(...)`
  (HTTP 200)** — nunca `res.status(400/500)`; el resultado de la operación
  viaja únicamente en `status_code`:
  - `0` = correcto. `1` = error de validación controlada (dato inválido,
    duplicado, no encontrado, sin permiso). `2` = error atrapado en el
    `catch`.
  - `message` siempre explica qué pasó; en éxito es un mensaje de negocio
    ("Proveedor actualizado correctamente"), en error dice la causa exacta.
  - `data`: array en consultas, `{ id }` en insert/update, `null` si no
    aplica.
  - Para validar obligatorios en la route con este mismo formato, usar
    `validarCamposStatusCode` (`back/middlewares/validar-campos.js`) — el
    `validarCampos` viejo (responde `res.status(400)` con el error crudo de
    `express-validator`) se conserva solo para los módulos legacy que ya lo
    usan; no usarlo en código nuevo.
- **Acceso a datos**: querys literales (SQL parametrizado vía
  `dbConnection.query(sql, { replacements, type: QueryTypes.X })`), no
  modelos Sequelize, para módulos nuevos — cuidar el manejo de la conexión
  y envolver en **transacción** (commit/rollback) cualquier operación que
  toque más de una tabla. Los módulos existentes que ya usan modelos
  Sequelize se mantienen así salvo que la tarea pida migrarlos.
- **Permisos (análisis 002)**: catálogo global del producto en `cat_modulos`,
  `cat_menus` (clave de menú, p. ej. `'sucursales'`) y `cat_acciones`; roles
  y permisos directos por empresa. Nunca crear un sistema paralelo.
  - Cada pantalla nueva agrega en su script SQL su **menú** y sus
    **acciones** (`<entidad>_CreateUpdate` / `_Disable` / `_Delete` u otras),
    con `accion` como clave técnica y `etiqueta` como lo que ve el cliente,
    y los agrega a las plantillas de rol que correspondan.
  - **Toda ruta que escribe** exige su acción: `validarAccion('clave')` (o
    `validarAccion(['una', 'otra'])`). Las **consultas** de una pantalla
    exigen su menú: `validarMenu('clave')`. Los dos van después de
    `validarJWT` y dejan `req.permisos` para el controlador.
  - Lo que puede un usuario sale **solo** de `back/helpers/userActions.js`
    (roles activos + permisos directos, filtrado por módulos contratados; el
    rol protegido Administrador tiene todo). Tiene caché por empresa y
    usuario: quien cambie roles o permisos llama a `invalidar` /
    `invalidarEmpresa`.
  - **Sin escalada**: quien otorga solo puede dar o quitar lo que tiene
    (`helpers/permisosEdicion.js`, `contiene`).
  - El menú y las acciones se exponen en el controller `global`
    (`getMenu`, `getUserActions`). `npm run auditar` falla si una escritura
    no exige acción.
- **Configuración de la empresa y constantes del sistema** (análisis 003):
  - un ajuste de negocio (tolerancia, días de cierre…) se lee SOLO con
    `configuracion.valor(req, 'clave', idSucursal?)` (`helpers/configuracion.js`):
    sucursal → general de la empresa → valor inicial, ya convertido a su
    tipo. Una clave inexistente lanza;
  - una constante técnica, con `constantes.valor('clave', req?)`
    (`helpers/constantes.js`): la de la empresa si existe, si no la global.
    Los secretos van en `.env`, nunca en `cat_constantes`;
  - **ajuste nuevo = un script**: fila en `cat_configuracion_ajustes` (con
    `tipoDato`, `control`, `opciones`, `validacion`, `valorInicial`,
    `bExcepcionSucursal`, `bAdvierteCalculos`) + `CALL
    sp_preparar_configuracion(NULL)`. La pantalla no se toca;
  - `helpers/valorTipado.js` es la única pieza que valida y convierte
    valores con tipo;
  - un dato que se filtra o se cruza en reportes NO va aquí: va en columnas.
- **Borrado permanente vs. llave foránea**: no agregar validaciones previas
  por cada tabla que pudiera referenciar el registro. Envolver el `DELETE`
  en `try/catch` y, si el error es de llave foránea
  (`SequelizeForeignKeyConstraintError` / errno MySQL 1451), responder
  `status_code: 1` con un mensaje tipo "No es posible eliminar porque se
  utiliza en otras tablas" — así no hay que tocar esta validación cada vez
  que la entidad gane una nueva FK.
- **Archivos (análisis 004)**: toda subida pasa por
  `subirArchivo('imagen' | 'excel')` (`back/middlewares/multer-config.js`):
  multer en memoria, un solo archivo en el campo `archivo`, tope de tamaño
  leído de una constante del sistema (`archivos.foto_max_mb`,
  `archivos.excel_max_mb`) y el tipo decidido por la **firma del contenido**,
  no por la extensión. Va después de `validarJWT` + `validarAccion` y antes
  de los `check(...)` del body (multipart). Un tipo nuevo = una entrada en
  `TIPOS` de ese archivo.
  - Lo que se guarda va en `back/almacen/empresas/<idEmpresa>/<carpeta>/`
    con nombre aleatorio, solo por `helpers/archivos.js` (`guardar`, `leer`,
    `borrar`). Nunca en `public/`: se entrega por un endpoint con sesión,
    empresa y alcance, y el nombre del archivo no viaja al navegador.
  - Los endpoints que regresan binario (foto, Excel) son la única excepción
    a `{ status_code, message, data }` en el éxito; sus errores sí son JSON.
    En el Front se piden con `responseType: 'blob'` y, si el Blob es
    `application/json`, es el error.
- Mantener nombres descriptivos en español/inglés según el módulo
  existente; no renombrar endpoints o contratos ya publicados.

## Frontend (`front/`)
- **Standalone components**, sin NgModules: cada pantalla/modal declara sus
  propios `imports: [...]` de Angular Material — no existe
  `protected.module.ts` ni un módulo central donde registrar componentes.
- Estructura por feature: `features/<área>/<entidad>/<entidad>.component.ts`
  (+ `.html` + `.scss`), con su modal CRUD en
  `features/<área>/<entidad>/mdl/<entidad>-modal/` y un `mdl/index.ts` que
  reexporta el componente y su interfaz `XxxModalData`. Rutas de área en
  `<área>.routes.ts` (lazy vía `loadComponent`).
- **Servicios API**: uno por entidad en `core/services/`, registrado en el
  barrel `core/services/index.ts`. Deben ser **pass-through puro**: cada
  método regresa `Observable<ResponseGet>` (interfaz en
  `models/common.models.ts`: `{ status_code, message, data: any }`)
  directo desde `this.http.get/post/put/delete(...)`, **sin** `pipe`,
  signals, notificaciones ni `catchError` dentro del servicio — el
  componente que lo consume interpreta `status_code`/`message` y decide
  qué mostrar. Rutas por acción, igual que el back
  (`${this.baseURL}/${this._api}/getEntidad`, etc.).
- **Modales CRUD no se cierran al guardar**: consumen el API, muestran el
  `message` de la respuesta dentro del modal (banner de éxito/error) y
  permanecen abiertos; tras un alta exitosa pasan a modo edición con el id
  recién creado. Solo se cierran con Cancelar/Cerrar/X, y ahí sí refrescan
  la lista si hubo cambios. Botón Guardar deshabilitado mientras el API
  responde.
- **Inputs y combos "reducidos"**: en listas y modales, usar el patrón de
  input nativo compacto ya establecido en
  `cotizacion-modal.component.scss` — `.slim-label` (etiqueta pequeña en
  mayúsculas arriba) + `.inline-wrap` + `.inline-input` (input/select/
  textarea nativo con `[formControl]`/`formControlName`, 36px de alto, 13px
  de fuente, borde 1px, radio 4px), en vez de `mat-form-field` de tamaño
  estándar. NO replicar el otro patrón de ese mismo archivo (`.header-chip`
  que se expande al hacer clic para editar) salvo que la tarea lo pida
  explícitamente — el default es solo el tamaño reducido, sin esa
  interacción.
- **Listas**: filtros compactos con las clases `inv-*` (`inv-page`,
  `inv-card`, `inv-filters-row`, `inv-btn-secondary`/`inv-btn-primary`/
  `inv-btn-nuevo`) como en `cotizaciones.component`. Búsqueda **manual**:
  los controles de filtro NO disparan la consulta al escribir; solo el
  botón "Buscar" (`.inv-btn-primary`) la ejecuta.
- **Tabla/cards responsive**: pantallas con volumen de datos deben poder
  alternar tabla y cards con un toggle manual, y cambiar sola a cards por
  debajo de ~768px. La preferencia manual se guarda en `user_preferences`
  (vía endpoints del controller `global`) **separada por categoría de
  pantalla** (`viewModeDesktop` / `viewModeMobile`, dos prefKeys) — nunca
  una sola preferencia global, porque entonces elegir tabla en escritorio
  fuerza tabla también en celular. El grid de cards usa CSS Grid con
  `grid-template-columns: repeat(auto-fit, minmax(<ancho-min>px, 1fr))`
  **sin** fijar `grid-template-columns: 1fr` en los `@media`
  responsive — `auto-fit` ya decide cuántas columnas caben según el ancho
  real disponible en cualquier breakpoint, y estira la(s) card(s) existente
  si hay pocas, evitando desperdiciar espacio.
- **Permisos de acciones**: consumir `GlobalService` (`tienePermiso('accion')`,
  `tieneMenu('menu')`; carga `global/getMenu` y `global/getUserActions`). El
  menú lateral llega del servidor; cada ruta se protege con
  `menuGuard('menu')` y se registra en `core/navegacion.ts`. Sin el
  permiso de crear/editar: ocultar el botón "Nuevo", cambiar el ícono de
  editar por uno de solo lectura (`visibility`) y abrir el modal
  deshabilitado sin botón Guardar. Cada acción de eliminar/desactivar
  depende de su propio permiso.


- **Colores: solo tokens `--rh-*`** (`styles/_tokens.scss`), nunca hex en
  componentes. El usuario escoge paleta (Índigo, Esmeralda, Océano,
  Terracota) y modo (claro, oscuro, automático); los tokens cambian solos.
  Una paleta nueva: bloque en `styles/_paletas.scss`, su Material en
  `styles.scss` y su renglón en `PALETAS` (`theme.service.ts`).
- **Preferencias del usuario**: `PreferenciasService` (`global/getPreferencias`
  y `global/setPreferencia`), por usuario y empresa. Nada que el usuario
  escoja se guarda solo en `localStorage`; el navegador solo guarda una
  copia para pintar rápido.
- **Fechas y horas de negocio: solo con el pipe `fechaSucursal`**
  (`shared/pipes/fecha-sucursal.pipe.ts`), con la zona de la sucursal del
  dato: `{{ m.fecha | fechaSucursal: m.zonaHoraria : 'hora' }}`. Nunca
  `DatePipe` ni `toLocale…` sin zona: mostrarían la hora del navegador. En
  vistas con sucursales de zonas distintas, el cuarto parámetro (`true`)
  agrega la zona. Lo que no tiene sucursal propia usa
  `auth.zonaActiva()`.
- **Fechas de negocio que son un día, no un instante** (ingreso, baja, "a
  partir de"; análisis 004): viajan como texto `AAAA-MM-DD` y se tratan como
  texto. Se muestran con el pipe `fechaNegocio` y "hoy" de una sucursal sale
  de `hoyEnZona(zona)` (`shared/utils/fecha-negocio.ts`); se capturan con
  `<input type="date">`, que ya da `AAAA-MM-DD`. Nunca pasan por `Date`.
- **Ficha del empleado**: un análisis que agrega una pestaña (Face ID,
  Horario, Asistencia…) la registra en `PESTANAS_EMPLEADO`
  (`features/personas/empleados/mdl/empleado-ficha-modal/pestanas.ts`): un
  componente standalone con el input `idEmpleado`. La ficha no se toca.
- **Ajustes con tipo** (configuración, constantes): se dibujan con
  `app-campo-dinamico` según el `control` del catálogo; no se escribe un
  formulario por ajuste.
- Evitar lógica de negocio compleja en templates; moverla a
  componentes/servicios.
- Formularios: usar `ReactiveFormsModule` con validaciones en el
  componente, no en template.
- Reusar componentes y modales existentes cuando sea posible.
- No introducir cambios visuales globales fuera del alcance pedido.
- **Toda pantalla/componente de lista o página principal DEBE registrar su
  título y sección** para que el layout compartido (`app-layout.component`)
  dibuje el botón de regreso automáticamente — no crear un botón manual por
  componente:
  - Inyectar `PageTitleService` (`core/services/page-title.service.ts`).
  - En `ngOnInit`: `this.pageTitle.setWithSection('<icono_material>',
    '<Título>', '<Descripción>', '<NombreSección>')` seguido de
    `this.pageTitle.setSectionId(<idseccion>)`. El layout calcula solo la
    ruta de regreso (`/app/configuracion/menus/<idseccion>`) y renderiza el
    botón; no hay que tocar el header del propio componente.
  - En `ngOnDestroy`: `this.pageTitle.clear()`.
  - Secciones de menú conocidas: Configuración = `idseccion 6`, Catálogos = `idseccion 7`.

## SQL (`SQL/`)
- Motor: MySQL. Herramienta de diseño: MySQL Workbench.
- Scripts nuevos deben ser idempotentes: usar `IF NOT EXISTS`, `IF EXISTS`, `INSERT IGNORE` o `ON DUPLICATE KEY UPDATE` según aplique. Si la tabla de destino NO tiene índice único sobre la columna que identifica el registro (p. ej. `actions.name`, `menus.ruta`), `INSERT IGNORE` no evita duplicados al reejecutar el script — usar `INSERT INTO ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM ... WHERE ...)` en su lugar.
- Stored Procedures: el proyecto los usa para listados y reportes complejos; seguir el patrón existente en `SQL/StoreProcedures_*.sql`.
- Mantener nombres de archivos descriptivos y orientados al cambio funcional.
- Si un cambio requiere migración + ajuste en backend, mantener ambos en la misma entrega.
- Incluir script de rollback cuando se eliminen o alteren objetos críticos.

## Calidad y validación
- Si se modifica backend, ejecutar validaciones/lint/tests disponibles de `back/`.
- Si se modifica frontend, ejecutar validaciones/lint/tests disponibles de `front/`.
- Priorizar pruebas cercanas al cambio antes de pruebas globales.
- Si no hay tests, validar al menos compilación o ejecución mínima del módulo modificado.

## Git y commits
- Usar mensajes de commit claros y orientados a negocio/técnica.
- Formato sugerido:
  - `feat: ...` para funcionalidad nueva
  - `fix: ...` para correcciones
  - `refactor: ...` para reorganización sin cambio funcional
  - `chore: ...` para tareas operativas
- Incluir en la descripción del commit qué se versiona y en qué capas impacta (back/front/SQL).

## Qué evitar
- No crear features “extra” no solicitadas.
- No cambiar estilos globales o arquitectura completa sin requerimiento explícito.
- No agregar comentarios innecesarios en el código.
- No romper compatibilidad de endpoints o contratos de servicio existentes.

## Convención de respuesta de Copilot
- Responder de forma breve, accionable y en español.
- Indicar claramente:
  1. Qué se cambió.
  2. Dónde se cambió.
  3. Cómo validar.
  4. Riesgos o pendientes.

## Prioridad en caso de conflicto
1. Requerimiento del usuario actual.
2. Estas instrucciones de repositorio.
3. Convenciones implícitas del código existente.
