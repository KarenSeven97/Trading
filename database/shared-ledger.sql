-- Intentional public shared journal, explicitly selected by the owner (mode B).
create table public.trading_shared_ledger (
 id text primary key check (id = 'main'),
 revision bigint not null default 0 check (revision >= 0),
 document jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.trading_shared_ledger enable row level security;
revoke all on public.trading_shared_ledger from anon, authenticated;
grant select, update(document, revision) on public.trading_shared_ledger to anon, authenticated;
create policy "Shared book readable by all visitors" on public.trading_shared_ledger for select to anon, authenticated using (id = 'main');
create policy "Shared book editable by all visitors" on public.trading_shared_ledger for update to anon, authenticated using (id = 'main') with check (id = 'main');

create function public.trading_validate_document() returns trigger language plpgsql security invoker set search_path = '' as $$
declare e jsonb; k text;
begin
 if tg_op = 'UPDATE' and new.revision <> old.revision + 1 then raise exception 'VERSION_CONFLICT'; end if;
 if pg_column_size(new.document) > 4000000 or new.document->>'mode' is distinct from 'live' or new.document->>'version' is distinct from '1'
 or jsonb_typeof(new.document->'executions') is distinct from 'array' or jsonb_typeof(new.document->'reviews') is distinct from 'object'
 or jsonb_typeof(new.document->'settings') is distinct from 'object' or jsonb_typeof(new.document->'instruments') is distinct from 'array'
 or jsonb_typeof(new.document->'watchlist') is distinct from 'array' then raise exception 'Invalid journal document'; end if;
 if new.document->>'revision' is distinct from '0' or jsonb_typeof(new.document->'bars') is distinct from 'array' or jsonb_array_length(new.document->'bars') <> 0 then raise exception 'Invalid shared document metadata'; end if;
 foreach k in array array['capital','dailyTarget','defaultFee'] loop
  if coalesce(new.document#>>array['settings',k],'') !~ '^[0-9]+(\.[0-9]{1,12})?$' then raise exception 'Invalid settings decimal'; end if;
 end loop;
 if (new.document#>>'{settings,dailyTarget}')::numeric > 1000000000 or (new.document#>>'{settings,defaultFee}')::numeric > 1000000000 or (new.document#>>'{settings,defaultFee}')::numeric < 0
 or (new.document#>>'{settings,theme}') not in ('dark','light') or jsonb_typeof(new.document#>'{settings,extraClosedDays}') is distinct from 'array' then raise exception 'Invalid device settings'; end if;
 if exists(select 1 from jsonb_array_elements(new.document#>'{settings,extraClosedDays}') d where jsonb_typeof(d)<>'string' or (d#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid closed days'; end if;
 if exists(select 1 from jsonb_array_elements(new.document->'watchlist') w where jsonb_typeof(w)<>'string' or (w#>>'{}') !~ '^[A-Z0-9.^=-]{1,16}$') then raise exception 'Invalid watchlist'; end if;
 if exists(select 1 from jsonb_array_elements(new.document->'watchlist') w group by w having count(*)>1) then raise exception 'Duplicate watchlist symbol'; end if;
 for e in select value from jsonb_array_elements(new.document->'instruments') loop
  if coalesce(e->>'symbol','') !~ '^[A-Z0-9.^=-]{1,16}$' or jsonb_typeof(e->'name') is distinct from 'string' or jsonb_typeof(e->'exchange') is distinct from 'string' or coalesce(e->>'type','') not in ('股票','ETF','反向 ETF') then raise exception 'Invalid instrument'; end if;
 end loop;
 for e in select value from jsonb_each(new.document->'reviews') loop
  if jsonb_typeof(e->'note') is distinct from 'string' or jsonb_typeof(e->'tags') is distinct from 'array' then raise exception 'Invalid review'; end if;
  if exists(select 1 from jsonb_array_elements(e->'tags') t where jsonb_typeof(t)<>'string') then raise exception 'Invalid review tags'; end if;
 end loop;
 if jsonb_array_length(new.document->'executions') > 20000 then raise exception 'Journal exceeds 20000 executions'; end if;
 if (new.document#>>'{settings,capital}')::numeric <= 0 or (new.document#>>'{settings,capital}')::numeric > 1000000000000
 or (new.document#>>'{settings,dailyTarget}')::numeric < 0 or (new.document#>>'{settings,costMethod}') is distinct from 'FIFO'
 or (new.document#>>'{settings,currency}') is distinct from 'USD' or (new.document#>>'{settings,timezone}') is distinct from 'America/New_York' then raise exception 'Invalid account settings'; end if;
 for e in select value from jsonb_array_elements(new.document->'executions') loop
  if coalesce(e->>'id','') = '' or coalesce(e->>'symbol','') !~ '^[A-Z0-9.^=-]{1,16}$' or coalesce(e->>'side','') not in ('buy','sell') or coalesce(e->>'source','') not in ('manual','csv') then raise exception 'Invalid execution'; end if;
  if jsonb_typeof(e->'note') is distinct from 'string' or jsonb_typeof(e->'tags') is distinct from 'array' or jsonb_typeof(e->'seq') is distinct from 'number' then raise exception 'Invalid execution details'; end if;
  if exists(select 1 from jsonb_array_elements(e->'tags') t where jsonb_typeof(t)<>'string') then raise exception 'Invalid execution tags'; end if;
  foreach k in array array['price','quantity','fee'] loop
   if jsonb_typeof(e->k) is distinct from 'string' or coalesce(e->>k,'') !~ '^[0-9]+(\.[0-9]{1,12})?$' then raise exception 'Invalid decimal'; end if;
   if (e->>k)::numeric > 1000000000000 or (k <> 'fee' and (e->>k)::numeric <= 0) then raise exception 'Invalid decimal range'; end if;
  end loop;
  if coalesce(e->>'time','') !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$' or (e->>'time')::timestamptz is null or (e->>'seq')::numeric is null then raise exception 'Invalid execution time'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(new.document->'executions') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate execution IDs'; end if;
 if exists(select 1 from (select sum(case when x->>'side'='buy' then (x->>'quantity')::numeric else -(x->>'quantity')::numeric end) over (partition by x->>'symbol' order by (x->>'time')::timestamptz,(x->>'seq')::numeric,x->>'id' rows unbounded preceding) qty from jsonb_array_elements(new.document->'executions') x) q where qty<0) then raise exception 'Sell quantity exceeds available position'; end if;
 new.updated_at := now(); return new;
end $$;
revoke execute on function public.trading_validate_document() from public, anon, authenticated;
create trigger validate_shared_ledger before insert or update on public.trading_shared_ledger for each row execute function public.trading_validate_document();

create function public.trading_write_ledger(expected_revision bigint, new_document jsonb)
returns setof public.trading_shared_ledger language sql security invoker set search_path = '' as $$
 update public.trading_shared_ledger set document = new_document, revision = expected_revision + 1
 where id='main' and revision=expected_revision returning *;
$$;
revoke execute on function public.trading_write_ledger(bigint,jsonb) from public;
grant execute on function public.trading_write_ledger(bigint,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';

-- Seed once as project owner; visitors cannot INSERT or DELETE the ledger container.
insert into public.trading_shared_ledger(id, document) values ('main',
'{"version":1,"revision":0,"mode":"live","settings":{"capital":"10000","dailyTarget":"1","currency":"USD","timezone":"America/New_York","defaultFee":"0","costMethod":"FIFO","theme":"dark","proxyUrl":"","extraClosedDays":[]},"instruments":[],"executions":[],"reviews":{},"watchlist":[],"bars":[]}'::jsonb) on conflict(id) do nothing;
