-- =====================================================================
-- Finanzas M&M — esquema de base de datos para Supabase
-- Cómo usarlo: Supabase > SQL Editor > New query > pega TODO este archivo
-- y presiona "Run". Se puede volver a ejecutar sin romper nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tablas ----------

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 8)),
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- kind: gasto | ingreso | ahorro | excluido (pagos de tarjeta, gastos de la agencia, etc.)
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  kind text not null default 'gasto' check (kind in ('gasto','ingreso','ahorro','excluido')),
  color text not null default '#64748b',
  monthly_budget numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

-- Reglas de auto-categorización: si la descripción contiene "pattern" => category
create table if not exists category_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  pattern text not null,
  category_id uuid not null references categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (household_id, pattern)
);

create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  file_name text not null,
  account text not null,
  person text not null,
  rows_imported int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  date date not null,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),   -- valor que cuenta para el mes
  original_amount numeric(14,2),                        -- valor total de la compra (si fue a cuotas)
  installments text,                                    -- ej: "1/36"
  type text not null check (type in ('gasto','ingreso')),
  category_id uuid references categories(id) on delete set null,
  account text not null default 'Manual',
  person text not null default 'Familia',
  notes text,
  import_id uuid references imports(id) on delete cascade,
  hash text,                                            -- evita importar dos veces lo mismo
  created_at timestamptz not null default now()
);
create unique index if not exists transactions_hash_uq on transactions(household_id, hash);
create index if not exists transactions_date_idx on transactions(household_id, date);

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  lender text,
  owner text not null default 'Familia',
  original_amount numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  monthly_payment numeric(14,2) not null default 0,
  monthly_rate numeric(6,4) not null default 0,         -- % mes vencido, ej 2.1593
  installments_left int not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  target numeric(14,2) not null default 0,
  saved numeric(14,2) not null default 0,
  monthly_contribution numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Seguridad (RLS): cada familia sólo ve lo suyo ----------

create or replace function is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = hid and user_id = auth.uid());
$$;

alter table households enable row level security;
alter table household_members enable row level security;
alter table categories enable row level security;
alter table category_rules enable row level security;
alter table imports enable row level security;
alter table transactions enable row level security;
alter table debts enable row level security;
alter table savings_goals enable row level security;

drop policy if exists "members read household" on households;
create policy "members read household" on households for select using (is_member(id));
drop policy if exists "members update household" on households;
create policy "members update household" on households for update using (is_member(id));

drop policy if exists "members read members" on household_members;
create policy "members read members" on household_members for select using (is_member(household_id));
drop policy if exists "members update own name" on household_members;
create policy "members update own name" on household_members for update using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['categories','category_rules','imports','transactions','debts','savings_goals'] loop
    execute format('drop policy if exists "household access" on %I', t);
    execute format(
      'create policy "household access" on %I for all using (is_member(household_id)) with check (is_member(household_id))', t);
  end loop;
end $$;

-- ---------- Funciones para crear la familia / unirse ----------

create or replace function seed_household(hid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into categories (household_id, name, kind, color, monthly_budget) values
    (hid, 'Arriendo',                     'gasto',   '#0ea5e9', 1750000),
    (hid, 'Mercado',                      'gasto',   '#22c55e', 700000),
    (hid, 'Comida por fuera',             'gasto',   '#f97316', 900000),
    (hid, 'Onces / Café',                 'gasto',   '#a16207', 0),
    (hid, 'Droguería',                    'gasto',   '#ec4899', 100000),
    (hid, 'Servicios públicos',           'gasto',   '#06b6d4', 217000),
    (hid, 'Celular e internet',           'gasto',   '#6366f1', 46000),
    (hid, 'Parqueadero',                  'gasto',   '#64748b', 260000),
    (hid, 'Gasolina',                     'gasto',   '#ef4444', 210000),
    (hid, 'Peajes y transporte',          'gasto',   '#78716c', 0),
    (hid, 'Carro (cuota y gastos)',       'gasto',   '#dc2626', 2171987),
    (hid, 'Seguros',                      'gasto',   '#9333ea', 0),
    (hid, 'Seguridad social',             'gasto',   '#7c3aed', 852355),
    (hid, 'Salud y planes complementarios','gasto',  '#db2777', 659900),
    (hid, 'Diezmo',                       'gasto',   '#ca8a04', 1530000),
    (hid, 'Ofrenda',                      'gasto',   '#eab308', 130000),
    (hid, 'Mamás',                        'gasto',   '#f43f5e', 260000),
    (hid, 'Mesada',                       'gasto',   '#84cc16', 100000),
    (hid, 'Suscripciones y streaming',    'gasto',   '#8b5cf6', 45000),
    (hid, 'Cuidado personal',             'gasto',   '#d946ef', 75000),
    (hid, 'Ropa',                         'gasto',   '#14b8a6', 0),
    (hid, 'Compras en línea',             'gasto',   '#f59e0b', 0),
    (hid, 'Hogar',                        'gasto',   '#10b981', 90000),
    (hid, 'Viajes',                       'gasto',   '#3b82f6', 0),
    (hid, 'Regalos',                      'gasto',   '#fb7185', 0),
    (hid, 'Intereses y cuota de manejo',  'gasto',   '#b91c1c', 72390),
    (hid, 'Abono a deudas',               'gasto',   '#991b1b', 0),
    (hid, 'Suplementos y gym',            'gasto',   '#65a30d', 0),
    (hid, 'Impuestos y retenciones',      'gasto',   '#475569', 220455),
    (hid, 'Otros',                        'gasto',   '#94a3b8', 0),
    (hid, 'Ingreso fijo',                 'ingreso', '#16a34a', 0),
    (hid, 'Ingresos variables',           'ingreso', '#15803d', 0),
    (hid, 'Auxilios agencia',             'ingreso', '#166534', 0),
    (hid, 'Ahorro',                       'ahorro',  '#0284c7', 0),
    (hid, 'Pago de tarjeta',              'excluido','#cbd5e1', 0),
    (hid, 'Agencia (negocio)',            'excluido','#e2e8f0', 0)
  on conflict (household_id, name) do nothing;

  insert into category_rules (household_id, pattern, category_id)
  select hid, r.pattern, c.id
  from (values
    ('EXITO','Mercado'),('ISIMO','Mercado'),('D1 ','Mercado'),('TIENDAS ARA','Mercado'),('JERONIMO MARTINS','Mercado'),
    ('CARULLA','Mercado'),('JUMBO','Mercado'),('OLIMPICA','Mercado'),('SALSAMENTARIA','Mercado'),('FRUVER','Mercado'),
    ('PRICESMART','Mercado'),('MAKRO','Mercado'),('COLSUBSIDIO','Mercado'),
    ('DIDI CO FOOD','Comida por fuera'),('RAPPI','Comida por fuera'),('CREPES','Comida por fuera'),('CORRAL','Comida por fuera'),
    ('RESTAURANTE','Comida por fuera'),('BACUBA','Comida por fuera'),('FRISBY','Comida por fuera'),('MCDONALD','Comida por fuera'),
    ('KFC','Comida por fuera'),('PIZZA','Comida por fuera'),('SUSHI','Comida por fuera'),('BURGER','Comida por fuera'),
    ('JUAN VALDEZ','Onces / Café'),('COFFEE','Onces / Café'),('PASTELER','Onces / Café'),('TOSTAO','Onces / Café'),
    ('STARBUCKS','Onces / Café'),('PANADERIA','Onces / Café'),
    ('DROGUERIA','Droguería'),('FARMATODO','Droguería'),('CRUZ VERDE','Droguería'),('LA REBAJA','Droguería'),('FARMACIA','Droguería'),
    ('PAGO FACTURA MOVIL','Celular e internet'),('CLARO','Celular e internet'),('MOVISTAR','Celular e internet'),('TIGO','Celular e internet'),
    ('ENEL','Servicios públicos'),('CODENSA','Servicios públicos'),('VANTI','Servicios públicos'),('ACUEDUCTO','Servicios públicos'),
    ('PARKING','Parqueadero'),('PARQUEADERO','Parqueadero'),('PARQUE','Parqueadero'),
    ('TERPEL','Gasolina'),('PRIMAX','Gasolina'),('BIOMAX','Gasolina'),('TEXACO','Gasolina'),('ESSO','Gasolina'),('ESTACION DE SERVICIO','Gasolina'),
    ('GOPASS','Peajes y transporte'),('PEAJE','Peajes y transporte'),('UBER','Peajes y transporte'),('DIDI','Peajes y transporte'),
    ('CABIFY','Peajes y transporte'),('TRANSMILENIO','Peajes y transporte'),
    ('ALLIANZ','Seguros'),('SURA','Seguros'),('SOAT','Seguros'),('SEGURO','Seguros'),
    ('COLSANITAS','Salud y planes complementarios'),('COOMEVA','Salud y planes complementarios'),('SANITAS','Salud y planes complementarios'),
    ('APPLE.COM','Suscripciones y streaming'),('MICROSOFT','Suscripciones y streaming'),('NETFLIX','Suscripciones y streaming'),
    ('SPOTIFY','Suscripciones y streaming'),('DISNEY','Suscripciones y streaming'),('YOUTUBE','Suscripciones y streaming'),
    ('GOOGLE','Suscripciones y streaming'),('HBO','Suscripciones y streaming'),('PRIME VIDEO','Suscripciones y streaming'),
    ('BARBERIA','Cuidado personal'),('PELUQUERIA','Cuidado personal'),
    ('MERCADO LIBRE','Compras en línea'),('MERCADOLIBRE','Compras en línea'),('MERCPAGO','Compras en línea'),('AMAZON','Compras en línea'),
    ('TEMU','Compras en línea'),('SHEIN','Compras en línea'),
    ('DOLLARCITY','Hogar'),('HOMECENTER','Hogar'),('IKEA','Hogar'),('TUGO','Hogar'),
    ('ZARA','Ropa'),('H&M','Ropa'),('ARTURO CALLE','Ropa'),('KOAJ','Ropa'),('STUDIO F','Ropa'),
    ('AVIANCA','Viajes'),('LATAM','Viajes'),('BOOKING','Viajes'),('AIRBNB','Viajes'),('DESPEGAR','Viajes'),
    ('INTERESES','Intereses y cuota de manejo'),('CUOTA DE MANEJO','Intereses y cuota de manejo'),('INTERES CORRIENTE','Intereses y cuota de manejo'),
    ('SMARTFIT','Suplementos y gym'),('BODYTECH','Suplementos y gym'),
    ('ABONO SUCURSAL','Pago de tarjeta'),('PAGO SUC VIRT','Pago de tarjeta'),('PAGO PSE','Pago de tarjeta'),('PAGO TARJETA','Pago de tarjeta'),
    ('ABONO','Pago de tarjeta'),
    ('SITEGROUND','Agencia (negocio)'),('SKOOL','Agencia (negocio)')
  ) as r(pattern, cat)
  join categories c on c.household_id = hid and c.name = r.cat
  on conflict (household_id, pattern) do nothing;
end $$;

-- Crea la familia para el usuario actual (lo usa la pantalla de bienvenida)
create or replace function create_household(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select household_id into hid from household_members where user_id = auth.uid() limit 1;
  if hid is not null then return hid; end if;

  insert into households (name) values (p_name) returning id into hid;
  insert into household_members (household_id, user_id, display_name) values (hid, auth.uid(), p_display_name);
  perform seed_household(hid);
  return hid;
end $$;

-- Une al usuario actual a una familia existente usando el código de invitación
create or replace function join_household(p_code text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select id into hid from households where invite_code = upper(trim(p_code));
  if hid is null then raise exception 'Código de invitación inválido'; end if;
  insert into household_members (household_id, user_id, display_name)
  values (hid, auth.uid(), p_display_name)
  on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return hid;
end $$;

revoke all on function seed_household(uuid) from public, anon, authenticated;
grant execute on function create_household(text, text) to authenticated;
grant execute on function join_household(text, text) to authenticated;
