# 💰 Finanzas M&M

Dashboard y seguimiento financiero familiar: importa los extractos del banco, los clasifica por categoría
automáticamente y muestra ingresos, gastos, presupuesto, deudas, ahorro y proyecciones. Para dos personas
(o más) que comparten las finanzas del hogar.

👉 **Para instalarla, sigue la [Guía paso a paso](GUIA.md).**

## Qué hace

- **Importar extractos** (Excel/CSV): reconoce el *Extracto Detallado* de tarjetas Bancolombia y extractos de cuentas;
  ignora columnas extra; no duplica movimientos si subes el mismo archivo dos veces.
- **Auto-categorización** con reglas ("contiene JUAN VALDEZ → Onces / Café") que aprenden de tus correcciones.
- **Dashboard** mensual: ingresos, gastos, ahorro, cuánto sobró/faltó, gastos por categoría vs. presupuesto, quién gastó, historial de 12 meses.
- **Presupuesto** por categoría, **deudas** con fecha de fin, **metas de ahorro** y **proyecciones** a 6–36 meses.
- Acceso con usuario y contraseña; la pareja se une con un código de invitación. Seguridad por filas (RLS) en Supabase.

## Tecnología

Next.js 15 (App Router) · React 19 · Tailwind CSS · Recharts · SheetJS · Supabase (Postgres + Auth) · Vercel

## Estructura

```
app/(app)/            pantallas (dashboard, importar, movimientos, presupuesto, deudas, ahorro, proyecciones, configuración)
app/login             inicio de sesión / registro
components/           navegación, contexto de la familia, componentes pequeños
lib/parser.ts         lectura de extractos (detección de columnas, números "1.234,56", fechas dd/mm/aaaa)
lib/categorize.ts     reglas de auto-categorización
lib/debts.ts          simulación de deudas
supabase/schema.sql   tablas, seguridad (RLS), categorías y reglas iniciales
```

## Desarrollo local

```bash
cp .env.example .env.local   # y pega tus llaves de Supabase
npm install
npm run dev
```
