-- =====================================================================
-- Actualización 003: historial de deudas, gastos fijos del mes,
-- categorías nuevas y reglas afinadas con los extractos de 2026.
-- Cómo usarlo: Supabase > SQL Editor > New query > pega TODO > Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

-- 1) Historial de cada deuda (cargos y abonos)
create table if not exists debt_movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  debt_id uuid not null references debts(id) on delete cascade,
  date date not null,
  description text not null,
  amount numeric(14,2) not null,          -- positivo = la deuda sube, negativo = abono
  balance_after numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists debt_movements_debt_idx on debt_movements(debt_id, date);

-- 2) Gastos fijos que se cargan cada mes con un clic (arriendo, mamá, carro, diezmo 10%...)
create table if not exists recurring_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  category_id uuid references categories(id) on delete set null,
  amount numeric(14,2) not null default 0,
  percent_of_income numeric(5,2),          -- ej: 10 => 10% de los ingresos del mes (diezmo)
  person text not null default 'Familia',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table debt_movements enable row level security;
alter table recurring_items enable row level security;
drop policy if exists "household access" on debt_movements;
create policy "household access" on debt_movements for all using (is_member(household_id)) with check (is_member(household_id));
drop policy if exists "household access" on recurring_items;
create policy "household access" on recurring_items for all using (is_member(household_id)) with check (is_member(household_id));

-- 3) Categorías nuevas
insert into categories (household_id, name, kind, color, monthly_budget)
select h.id, c.name, c.kind, c.color, 0
from households h, (values
  ('Skool', 'ingreso', '#22c55e'),
  ('Asesorías', 'ingreso', '#4ade80'),
  ('Reembolsos', 'ingreso', '#86efac'),
  ('Tarjeta Nu Bank', 'gasto', '#a855f7'),
  ('Por verificar', 'gasto', '#f59e0b'),
  ('Diezmo pagado (ya apartado)', 'excluido', '#fde68a')
) as c(name, kind, color)
on conflict (household_id, name) do nothing;

-- 4) Reglas (si ya existía una regla con el mismo texto, se actualiza su categoría)
insert into category_rules (household_id, pattern, category_id)
select c.household_id, r.pattern, c.id
from (values
  ('EXITO','Mercado'), ('ISIMO','Mercado'), ('D1 ','Mercado'), ('TIENDA D1','Mercado'), ('TIENDAS ARA','Mercado'), ('JERONIMO MARTINS','Mercado'), ('CARULLA','Mercado'), ('JUMBO','Mercado'),
  ('OLIMPICA','Mercado'), ('SALSAMENTARIA','Mercado'), ('FRUVER','Mercado'), ('FRUTIVERDURAS','Mercado'), ('FRUVAR','Mercado'), ('ALIMENTARI','Mercado'), ('DISTRICARNES','Mercado'), ('GARDEN MARKET','Mercado'),
  ('INDUSTRIAS ALIMENTARI','Mercado'), ('COLSUB TIENDA','Mercado'), ('PRICESMART','Mercado'), ('MAKRO','Mercado'), ('DIDI CO FOOD','Comida por fuera'), ('DIDI FOOD','Comida por fuera'), ('RAPPI','Comida por fuera'), ('CREPES','Comida por fuera'),
  ('CREPESYWAFFLES','Comida por fuera'), ('CORRAL','Comida por fuera'), ('RESTAURANTE','Comida por fuera'), ('BACUBA','Comida por fuera'), ('FRISBY','Comida por fuera'), ('MC DONALD','Comida por fuera'), ('MCDONALD','Comida por fuera'), ('KFC','Comida por fuera'),
  ('PIZZA','Comida por fuera'), ('SUSHI','Comida por fuera'), ('BURGER','Comida por fuera'), ('DOMINOS','Comida por fuera'), ('SUBWAY','Comida por fuera'), ('TRATTORIA','Comida por fuera'), ('SPOLETO','Comida por fuera'), ('LOS HORNITOS','Comida por fuera'),
  ('AJIACOS','Comida por fuera'), ('BORU FOOD','Comida por fuera'), ('EL GALAPAGO','Comida por fuera'), ('UBER *EATS','Comida por fuera'), ('EATS','Comida por fuera'), ('BRASAS','Comida por fuera'), ('EL RINCON DEL S','Comida por fuera'), ('HAMBURGUES','Comida por fuera'),
  ('CHIKOS','Comida por fuera'), ('TORO SALVAJE','Comida por fuera'), ('BALTHAZAR','Comida por fuera'), ('ZAATAR','Comida por fuera'), ('TUBOLETA','Comida por fuera'), ('PLACITA','Comida por fuera'), ('SR WOK','Comida por fuera'), ('DONUCOL','Comida por fuera'),
  ('OANA','Comida por fuera'), ('ARCHIE S','Comida por fuera'), ('JUAN VALDEZ','Onces / Café'), ('COFFEE','Onces / Café'), ('COFFE','Onces / Café'), ('PASTELER','Onces / Café'), ('TOSTAO','Onces / Café'), ('STARBUCKS','Onces / Café'),
  ('PANADERIA','Onces / Café'), ('EXPERTOS EN CAFE','Onces / Café'), ('DEJAMU','Onces / Café'), ('AVENA CUBANA','Onces / Café'), ('PAN PA YA','Onces / Café'), ('HEVALU','Onces / Café'), ('TEA FOR U','Onces / Café'), ('TIE CAF JUAN VAL','Onces / Café'),
  ('TJV ','Onces / Café'), ('OXXO','Onces / Café'), ('COSECHAS','Onces / Café'), ('GANACHE','Onces / Café'), ('WANNA NATURAL','Onces / Café'), ('FIORE','Onces / Café'), ('AVBRIL','Onces / Café'), ('BUBBLE','Onces / Café'),
  ('GOYURT','Onces / Café'), ('CAFE','Onces / Café'), ('DROGUERIA','Droguería'), ('FARMATODO','Droguería'), ('CRUZ VERDE','Droguería'), ('LA REBAJA','Droguería'), ('FARMACIA','Droguería'), ('PHARMA','Droguería'),
  ('CLINICA','Salud y planes complementarios'), ('CENTRO MEDICA','Salud y planes complementarios'), ('COLSANITAS','Salud y planes complementarios'), ('COOMEVA','Salud y planes complementarios'), ('SANITAS','Salud y planes complementarios'), ('PARKING','Parqueadero'), ('PARQUEADERO','Parqueadero'), ('PRQUEAD','Parqueadero'),
  ('DESARROLLADORA CC FONT','Parqueadero'), ('SUPERIOR EXPRES','Parqueadero'), ('TERPEL','Gasolina'), ('PRIMAX','Gasolina'), ('BIOMAX','Gasolina'), ('TEXACO','Gasolina'), ('ESSO','Gasolina'), ('GASOLINA','Gasolina'),
  ('EDS ','Gasolina'), ('ESTACION DE SERVICIO','Gasolina'), ('GOPASS','Peajes y transporte'), ('PEAJE','Peajes y transporte'), ('PEJAES','Peajes y transporte'), ('UBER RIDES','Peajes y transporte'), ('UBER','Peajes y transporte'), ('DIDI','Peajes y transporte'),
  ('CABIFY','Peajes y transporte'), ('TRANSPORTE','Peajes y transporte'), ('TERMINAL DE TRANSPORTE','Peajes y transporte'), ('METROKIA','Carro (cuota y gastos)'), ('KIA ','Carro (cuota y gastos)'), ('DOLLARCITY','Hogar'), ('HOMECENTER','Hogar'), ('IKEA','Hogar'),
  ('TUGO','Hogar'), ('FILTRO','Hogar'), ('DISPENSADOR','Hogar'), ('ASPIRADORA','Hogar'), ('MINISO','Hogar'), ('COMPLEJO COMERCIAL','Hogar'), ('CENTRO COMERCIAL','Hogar'), ('BARBERIA','Cuidado personal'),
  ('BARBERRIA','Cuidado personal'), ('PELUQUERIA','Cuidado personal'), ('PERFUME','Cuidado personal'), ('SPA DE UNAS','Cuidado personal'), ('LINEA ESTETICA','Cuidado personal'), ('ZARA','Ropa'), ('H&M','Ropa'), ('ARTURO CALLE','Ropa'),
  ('KOAJ','Ropa'), ('STUDIO F','Ropa'), ('ZAPATOS','Ropa'), ('SKECHERS','Ropa'), ('GIMNASIO','Suplementos y gym'), ('SMARTFIT','Suplementos y gym'), ('BODYTECH','Suplementos y gym'), ('OMEGA','Suplementos y gym'),
  ('NETFLIX','Suscripciones y streaming'), ('SPOTIFY','Suscripciones y streaming'), ('DISNEY','Suscripciones y streaming'), ('YOUTUBE','Suscripciones y streaming'), ('HBO','Suscripciones y streaming'), ('PRIME VIDEO','Suscripciones y streaming'), ('PLAYSTATION','Suscripciones y streaming'), ('EL TIEMPO CALL SUSCRIP','Suscripciones y streaming'),
  ('MERCADO LIBRE','Compras en línea'), ('MERCADOLIBRE','Compras en línea'), ('AMAZON','Compras en línea'), ('TEMU','Compras en línea'), ('SHEIN','Compras en línea'), ('LIBRERIA','Otros'), ('PAPEL NET','Otros'), ('CELULAR MAMA','Mamás'),
  ('HOTEL','Viajes'), ('LATAM','Viajes'), ('BOOKING','Viajes'), ('AIRBNB','Viajes'), ('CUCAYO','Viajes'), ('TJV AEROPUERTO','Viajes'), ('INTERESES','Intereses y cuota de manejo'), ('INTERES CORRIENTE','Intereses y cuota de manejo'),
  ('INTERESES MORA','Intereses y cuota de manejo'), ('APPLE.COM','Agencia (negocio)'), ('MICROSOFT','Agencia (negocio)'), ('CUOTA DE MANEJO','Agencia (negocio)'), ('PAGO FACTURA MOVIL','Agencia (negocio)'), ('SITEGROUND','Agencia (negocio)'), ('SKOOL','Agencia (negocio)'), ('KOSMOS','Agencia (negocio)'),
  ('WOMPI*KOSMOS','Agencia (negocio)'), ('FACEBK','Agencia (negocio)'), ('FACEBOOK','Agencia (negocio)'), ('WHOP*','Agencia (negocio)'), ('PACIENTES ILIMITADOS','Agencia (negocio)'), ('DASHLANE','Agencia (negocio)'),
  ('VTURB','Agencia (negocio)'), ('PLAN CELULAR','Agencia (negocio)'), ('CLARO MOVIL','Agencia (negocio)'), ('CLARO COLOMBIA','Agencia (negocio)'), ('COMCEL','Agencia (negocio)'), ('HDI SEGUROS','Abono a deudas'),
  ('TRANSAVIA','Abono a deudas'), ('DESPEGAR','Abono a deudas'), ('ROYAL CARIBBEAN','Abono a deudas'), ('AVIANCA','Abono a deudas'), ('CONTROL PLAY 5','Abono a deudas'), ('IGLESIA EL LUGAR','Diezmo pagado (ya apartado)'), ('DIEZMO','Diezmo pagado (ya apartado)'), ('BOLD','Por verificar'),
  ('WOMPI','Por verificar'), ('MERCPAGO','Por verificar'), ('MERCADOPAGO','Por verificar'), ('MERCADO PAGO','Por verificar'), ('PAYU','Por verificar'), ('EPAYCO','Por verificar'), ('DLO*','Por verificar'), ('PAYPAL','Por verificar'),
  ('SUMUP','Por verificar'), ('PLACETOPAY','Por verificar'), ('TPAGA','Por verificar'), ('CARDPAY','Por verificar')
) as r(pattern, cat)
join categories c on c.name = r.cat
on conflict (household_id, pattern) do update set category_id = excluded.category_id;

notify pgrst, 'reload schema';
