# Truck Manager · Front

Angular 20 standalone + Angular Material (tema violeta M3, claro/oscuro).

```bash
npm install
npx ng serve        # http://localhost:4200, API en http://127.0.0.1:9090/api
npx ng build
```

- Diseño aprobado 2026-11-10: barra lateral por módulo, barra superior con
  empresa y sucursal, inicio "Hoy". En celular: cajón + barra inferior.
- `environment.development.ts` → `sinLogin: true` es **temporal** (deja ver el
  layout sin sesión) hasta el análisis 001.
- Directivas traídas de AgroEnvases: `appTabsDeslizables`, `appTablaTarjetas`,
  `appEnterSecuencial`, `appAutoFocus`.
