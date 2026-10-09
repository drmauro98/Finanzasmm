# 📘 Guía paso a paso (para principiantes)

Con esta guía vas a tener **Finanzas M&M** funcionando en internet, con usuario para ti y para tu esposa.
No necesitas saber programar: sólo seguir los pasos en orden. Tiempo estimado: **30–45 minutos**.

Vas a usar 3 servicios gratuitos:

| Servicio | Para qué sirve | Analogía |
|---|---|---|
| **GitHub** | Guarda el código de la app | El "Drive" del código |
| **Supabase** | Base de datos + usuarios y contraseñas | El "Excel gigante" seguro en la nube |
| **Vercel** | Publica la app en una dirección web | El "hosting" que la pone en línea |

---

## Paso 1 — Crear el proyecto en Supabase (la base de datos)

1. Entra a **https://supabase.com** y haz clic en **Start your project**. Regístrate con tu cuenta de GitHub.
2. Clic en **New project**.
   - **Name:** `finanzas-mm`
   - **Database Password:** inventa una contraseña fuerte y **guárdala** (no la necesitarás seguido, pero no la pierdas).
   - **Region:** `South America (São Paulo)` (la más cercana a Colombia).
   - Clic en **Create new project** y espera 1–2 minutos.
3. Crear las tablas:
   - En el menú de la izquierda entra a **SQL Editor** (ícono `>_`).
   - Clic en **New query**.
   - Abre el archivo [`supabase/schema.sql`](supabase/schema.sql) de este repositorio, copia **todo** su contenido y pégalo.
   - Clic en **Run** (abajo a la derecha). Debe decir *Success. No rows returned*. ✅
4. Copiar las "llaves" (las vas a necesitar en el paso 2):
   - Ve a **Project Settings** (⚙️ abajo a la izquierda) → **API** (o **Data API** / **API Keys**).
   - Copia en un bloc de notas:
     - **Project URL** → algo como `https://abcdxyz.supabase.co`
     - **anon public key** (también puede llamarse **Publishable key**) → un texto largo.
   - ⚠️ **No** copies la `service_role` / `secret` key. Esa nunca se usa en la app.

## Paso 2 — Publicar la app en Vercel

1. Entra a **https://vercel.com** → **Sign Up** → **Continue with GitHub**.
2. Clic en **Add New… → Project**.
3. Busca el repositorio **Finanzasmm** y clic en **Import**.
   - Si no aparece: clic en *Adjust GitHub App Permissions* y dale acceso al repositorio.
4. Antes de dar Deploy, abre **Environment Variables** y agrega estas dos (nombre exacto, valor del paso 1.4):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | tu Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tu anon / publishable key |

5. Clic en **Deploy** y espera ~2 minutos. 🎉
6. Vercel te dará una dirección como `https://finanzasmm.vercel.app`. **Cópiala.**

> 💡 Si en GitHub el código está en una rama diferente a `main` (por ejemplo `claude/...`), primero
> une el *Pull Request* a `main`, o en Vercel ve a **Settings → Git → Production Branch** y escribe el nombre de la rama.

## Paso 3 — Decirle a Supabase cuál es tu dirección web

Esto es para que los correos de confirmación lleven a tu app.

1. En Supabase: **Authentication → URL Configuration**.
2. **Site URL:** pega tu dirección de Vercel (ej: `https://finanzasmm.vercel.app`).
3. En **Redirect URLs** clic en **Add URL** y agrega: `https://finanzasmm.vercel.app/**`
4. **Save**.

## Paso 4 — Crear sus cuentas

1. Abre tu dirección de Vercel → **¿Primera vez? Crea tu cuenta** → correo + contraseña.
2. Te llegará un correo de Supabase: ábrelo y confirma. Volverás a la app.
3. Pantalla de bienvenida → **Crear familia** → escribe tu nombre (ej: *Mao*) → Continuar.
4. Ve a **⚙️ Configuración** y copia el **código de invitación** (8 letras/números).
5. Tu esposa abre la misma dirección, crea su cuenta, confirma el correo y elige **Unirme con código** → pega el código → su nombre (ej: *Mari*).

Listo: los dos ven la misma información. 👫

## Paso 5 — Cerrar la puerta (muy recomendado) 🔒

Ya que los dos tienen cuenta, evita que cualquier otra persona se registre:

- Supabase → **Authentication → Sign In / Providers** (en algunas versiones: *Authentication → Settings*)
  → desactiva **Allow new users to sign up** → **Save**.

Aunque alguien se registrara, **no podría ver sus datos** (cada familia sólo ve lo suyo), pero así queda más ordenado.

---

## 📅 Uso de cada mes (5 minutos en vez del "cuadrito")

1. **Descarga el extracto** del banco como siempre.
   - Si lo tienes en Google Sheets: *Archivo → Descargar → Microsoft Excel (.xlsx)*.
   - Funciona con el *Extracto Detallado* de tarjetas Bancolombia (Visa/Master), extractos de cuenta de ahorros y la mayoría de CSV/Excel de otros bancos.
2. En la app → **📥 Importar extracto** → selecciona el archivo.
3. Elige **de quién es** (Mao / Mari / Familia) y revisa el nombre de la tarjeta.
4. La app ya **clasifica sola** cada compra (Éxito → Mercado, Juan Valdez → Onces, DiDi Food → Comida por fuera, etc.).
   Las que no sepa quedan en amarillo: elige la categoría. **La app aprende** y la próxima vez lo hará sola.
5. Clic en **Guardar**. Si subes el mismo archivo dos veces, no se duplica nada.
6. En **🧾 Movimientos → ＋ Agregar manual** registra lo que no sale en el extracto: **salarios, ingresos de la agencia, arriendo pagado por transferencia, efectivo**.
7. Mira el **📊 Dashboard**: ingresos, gastos, cuánto les **sobró o faltó**, gastos por categoría vs. presupuesto, quién gastó y el historial.

### Detalles útiles

- **Compras a cuotas:** por defecto se cuenta sólo la cuota del mes (lo que realmente pagan ese mes). Se puede cambiar al importar.
- **Pagos a la tarjeta y gastos de la agencia:** van en categorías de tipo *"No cuenta"*. Quedan guardados pero no inflan los gastos de la familia.
- **🎯 Presupuesto:** toca el valor de cada categoría para cambiarlo. Viene precargado con los valores de su Excel "Presupuesto Anual 2026".
- **💳 Deudas:** agrega carro, sala, Play, seguro, TV… con el **saldo de hoy**, la **cuota mensual** y las **cuotas que faltan**. Cada mes toca **✓ Pagué la cuota**. La app te dice cuándo quedan libres de cada una.
- **🐷 Ahorro:** metas (colchón, diciembre, ropa, bebé…) con lo que llevan y el aporte mensual.
- **🔮 Proyecciones:** usa el promedio de los últimos meses + las deudas para mostrar cuánto les sobrará los próximos 12–36 meses y cuándo se libera plata al terminar cada deuda. Puedes cambiar los números para simular ("¿y si gastamos 500 mil menos en comida por fuera?").
- **¿Te equivocaste importando?** ⚙️ Configuración → *Importaciones recientes* → **Deshacer**.
- **En el celular:** abre la dirección en Safari/Chrome → *Compartir → Agregar a pantalla de inicio*. Queda como una app.

---

## 🛠️ (Opcional) Correrla en tu computador

Sólo si quieres hacer cambios al código:

1. Instala **Node.js 20 o superior** desde https://nodejs.org (botón LTS).
2. Descarga el código: en GitHub → **Code → Download ZIP** (o `git clone`).
3. En la carpeta del proyecto, copia `.env.example` como `.env.local` y pega tus dos llaves de Supabase.
4. En la terminal, dentro de la carpeta:
   ```bash
   npm install
   npm run dev
   ```
5. Abre http://localhost:3000

Cada vez que subas cambios a GitHub, Vercel publica la nueva versión automáticamente.

---

## ❓ Problemas comunes

| Problema | Solución |
|---|---|
| La página sale en blanco o error al entrar | Revisa en Vercel → Settings → Environment Variables que los dos nombres estén **exactos**. Luego *Deployments → ⋯ → Redeploy*. |
| El correo de confirmación lleva a `localhost` | Te faltó el **Paso 3** (Site URL en Supabase). |
| No me llega el correo | Revisa spam. El plan gratis de Supabase envía pocos correos por hora; espera unos minutos. Alternativa: Supabase → Authentication → Users → *Add user* (con *Auto Confirm*). |
| "Código de invitación inválido" | Copia el código exacto desde ⚙️ Configuración (8 caracteres). |
| El importador no reconoce mi archivo | Abre la sección "Columnas" en la pantalla de importar e indica en qué columna está la fecha, la descripción y el valor. |
| "Supabase pausó mi proyecto" | En el plan gratis, si nadie usa la app por 7 días se pausa. Entra a supabase.com y dale **Restore**. Usándola cada mes no debería pasar seguido. |
