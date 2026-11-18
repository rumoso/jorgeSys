# Truck Manager

Servicio multiempresa para líneas de transporte (fletes, citas, choferes,
unidades y cajas). Arquitectura, análisis y tareas en `JorgeSysPlan` (el repo
que contiene `dev/`). La v2 parte de la base de RH (`RHPlan/dev/RH`).

- `back/`: API Node/Express/Sequelize + MySQL. `npm install`, copia
  `.example.env` a `.env` y `npm run dev` (puerto 9090, base
  `db_truck_manager`).
- `front/`: Angular standalone (`npx ng serve`, API en
  `http://127.0.0.1:9090/api`).
- `SQL/`: scripts por análisis (001–015 vienen de RH; 020 en adelante son de
  Truck Manager) y el modelo histórico `truck_manager.mwb` de la v1.
