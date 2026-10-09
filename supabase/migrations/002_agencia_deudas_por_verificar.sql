-- =====================================================================
-- Actualización 002: Agencia, deudas y categoría "Por verificar"
-- Cómo usarlo: Supabase > SQL Editor > New query > pega TODO > Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

-- 1) Nueva categoría "Por verificar" para cada familia
insert into categories (household_id, name, kind, color, monthly_budget)
select id, 'Por verificar', 'gasto', '#f59e0b', 0 from households
on conflict (household_id, name) do nothing;

-- 2) Reglas nuevas o corregidas (si la regla ya existía, se cambia su categoría)
insert into category_rules (household_id, pattern, category_id)
select c.household_id, r.pattern, c.id
from (values
  -- Gastos de la agencia (se guardan pero no suman al presupuesto familiar)
  ('APPLE.COM','Agencia (negocio)'), ('MICROSOFT','Agencia (negocio)'), ('CUOTA DE MANEJO','Agencia (negocio)'),
  ('PAGO FACTURA MOVIL','Agencia (negocio)'), ('SITEGROUND','Agencia (negocio)'), ('SKOOL','Agencia (negocio)'),
  ('KOSMOS','Agencia (negocio)'), ('WOMPI*KOSMOS','Agencia (negocio)'),
  -- Cuotas de deudas vigentes
  ('HDI SEGUROS','Abono a deudas'), ('TRANSAVIA','Abono a deudas'), ('DESPEGAR','Abono a deudas'),
  ('ROYAL CARIBBEAN','Abono a deudas'), ('AVIANCA','Abono a deudas'),
  -- Pasarelas de pago: no se sabe qué se compró, hay que revisarlas
  ('BOLD','Por verificar'), ('WOMPI','Por verificar'), ('MERCPAGO','Por verificar'), ('MERCADOPAGO','Por verificar'),
  ('MERCADO PAGO','Por verificar'), ('PAYU','Por verificar'), ('EPAYCO','Por verificar'), ('DLO*','Por verificar'),
  ('PAYPAL','Por verificar'), ('SUMUP','Por verificar'), ('PLACETOPAY','Por verificar'), ('TPAGA','Por verificar')
) as r(pattern, cat)
join categories c on c.name = r.cat
on conflict (household_id, pattern) do update set category_id = excluded.category_id;

-- 3) Reclasificar movimientos ya importados a los que les aplica una de estas reglas
--    (gana la regla más larga entre TODAS, igual que en la app: "BOLD SA*PASTELER" sigue siendo Onces)
update transactions t
set category_id = x.category_id
from (
  select distinct on (t2.id) t2.id, cr.pattern, cr.category_id
  from transactions t2
  join category_rules cr
    on cr.household_id = t2.household_id
   and upper(t2.description) like '%' || replace(replace(cr.pattern, '%', '\%'), '_', '\_') || '%'
  where t2.type = 'gasto'
  order by t2.id, length(cr.pattern) desc
) x
where t.id = x.id
  and x.pattern in ('APPLE.COM','MICROSOFT','CUOTA DE MANEJO','PAGO FACTURA MOVIL','SITEGROUND','SKOOL','KOSMOS',
                    'WOMPI*KOSMOS','HDI SEGUROS','TRANSAVIA','DESPEGAR','ROYAL CARIBBEAN','AVIANCA','BOLD','WOMPI',
                    'MERCPAGO','MERCADOPAGO','MERCADO PAGO','PAYU','EPAYCO','DLO*','PAYPAL','SUMUP','PLACETOPAY','TPAGA');

-- 4) Gastos que quedaron sin categoría pasan a "Por verificar"
update transactions t
set category_id = c.id
from categories c
where c.household_id = t.household_id and c.name = 'Por verificar'
  and t.category_id is null and t.type = 'gasto';

notify pgrst, 'reload schema';
