create extension if not exists pgcrypto with schema extensions;

create table public.studio_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.studio_settings(key, value) values
  ('image_cost_dzd', '{"value":6.8}'::jsonb),
  ('credit_carryover', '{"enabled":true}'::jsonb),
  ('expiry_warning_days', '{"value":7}'::jsonb)
on conflict (key) do nothing;

create table public.studio_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(name) between 2 and 100),
  description text not null default '',
  price_dzd numeric(12,2) not null check (price_dzd >= 0),
  included_credits integer not null check (included_credits > 0),
  background_removals integer not null check (background_removals > 0),
  validity_days integer not null check (validity_days between 1 and 3660),
  quality text not null default 'HD',
  max_file_size_bytes bigint not null default 10485760 check (max_file_size_bytes between 1024 and 104857600),
  max_image_side integer not null default 6000 check (max_image_side between 256 and 30000),
  concurrent_jobs integer not null default 1 check (concurrent_jobs between 1 and 20),
  batch_allowed boolean not null default false,
  max_batch_images integer not null default 1 check (max_batch_images between 1 and 100),
  retention_days integer not null default 0 check (retention_days between 0 and 3650),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  badge text,
  active boolean not null default false,
  available_for_sale boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  sales_limit integer check (sales_limit is null or sales_limit >= 0),
  sold_count integer not null default 0 check (sold_count >= 0),
  archived boolean not null default false,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.studio_payment_methods (
  id uuid primary key default gen_random_uuid(),
  method_type text not null default 'ccp' check (method_type in ('ccp','baridimob','manual')),
  label text not null default 'Paiement CCP',
  account_holder text not null,
  ccp_number text,
  ccp_key text,
  rip text,
  baridimob_number text,
  instructions text not null default '',
  proof_deadline_hours integer not null default 48 check (proof_deadline_hours between 1 and 720),
  average_validation_hours integer not null default 24 check (average_validation_hours between 1 and 720),
  max_proof_bytes bigint not null default 10485760 check (max_proof_bytes between 1024 and 52428800),
  active boolean not null default false,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ccp_number is not null or baridimob_number is not null or rip is not null)
);

create sequence public.studio_order_reference_seq;

create table public.studio_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid not null references public.studio_plans(id) on delete restrict,
  plan_snapshot jsonb not null,
  expected_amount_dzd numeric(12,2) not null check (expected_amount_dzd >= 0),
  currency text not null default 'DZD' check (currency = 'DZD'),
  payment_method_id uuid not null references public.studio_payment_methods(id) on delete restrict,
  status text not null default 'pending_payment' check (status in (
    'pending_payment','waiting_proof','proof_received','under_review',
    'additional_proof_required','approved','paid','rejected','cancelled','expired','suspicious'
  )),
  idempotency_key uuid not null unique,
  proof_deadline_at timestamptz not null,
  expires_at timestamptz not null,
  declared_amount_dzd numeric(12,2),
  receipt_reference text,
  payer_name text,
  payer_phone text,
  payment_date date,
  payment_time time,
  payment_channel text,
  client_comment text,
  review_note text,
  rejection_reason text,
  created_ip inet,
  user_agent text,
  revision bigint not null default 0,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  receipt_number text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at >= proof_deadline_at)
);

create index studio_orders_user_created_idx on public.studio_orders(user_id, created_at desc);
create index studio_orders_review_queue_idx on public.studio_orders(status, created_at)
  where status in ('proof_received','under_review','additional_proof_required','suspicious');

create table public.studio_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.studio_orders(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','under_review','approved','rejected','replaced')),
  is_current boolean not null default true,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create unique index studio_payment_proofs_current_idx on public.studio_payment_proofs(order_id) where is_current;
create unique index studio_payment_proofs_sha_idx on public.studio_payment_proofs(sha256) where status <> 'rejected';

create table public.studio_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid not null references public.studio_plans(id) on delete restrict,
  source_order_id uuid not null unique references public.studio_orders(id) on delete restrict,
  plan_snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending','active','expiring_soon','expired','suspended','cancelled')),
  starts_at timestamptz,
  expires_at timestamptz,
  activated_by uuid references public.profiles(id),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index studio_subscriptions_one_active_idx on public.studio_subscriptions(user_id) where status in ('active','expiring_soon');

create table public.studio_credit_wallets (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  available_credits integer not null default 0 check (available_credits >= 0),
  reserved_credits integer not null default 0 check (reserved_credits >= 0),
  consumed_credits bigint not null default 0 check (consumed_credits >= 0),
  expired_credits bigint not null default 0 check (expired_credits >= 0),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.studio_credit_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  subscription_id uuid not null references public.studio_subscriptions(id) on delete restrict,
  source_order_id uuid not null unique references public.studio_orders(id) on delete restrict,
  original_credits integer not null check (original_credits > 0),
  remaining_credits integer not null check (remaining_credits >= 0),
  reserved_credits integer not null default 0 check (reserved_credits >= 0),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','consumed','expired','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studio_credit_batches_spend_idx on public.studio_credit_batches(user_id, expires_at)
  where status = 'active';

create table public.studio_image_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  subscription_id uuid not null references public.studio_subscriptions(id) on delete restrict,
  credit_batch_id uuid not null references public.studio_credit_batches(id) on delete restrict,
  request_key uuid not null,
  status text not null default 'reserved' check (status in ('reserved','processing','succeeded','failed','refunded','cancelled')),
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  batch_count integer not null default 1 check (batch_count > 0),
  provider text not null default 'photoroom',
  provider_request_id text,
  cost_dzd numeric(12,4) not null default 0 check (cost_dzd >= 0),
  failure_code text,
  reserved_at timestamptz not null default now(),
  processing_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, request_key)
);

create index studio_image_jobs_active_idx on public.studio_image_jobs(user_id, status)
  where status in ('reserved','processing');

create table public.studio_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  batch_id uuid references public.studio_credit_batches(id) on delete restrict,
  order_id uuid references public.studio_orders(id) on delete restrict,
  image_job_id uuid references public.studio_image_jobs(id) on delete restrict,
  operation text not null check (operation in ('grant','reserve','consume','refund','expire','adjustment')),
  amount integer not null check (amount > 0),
  available_balance_after integer not null check (available_balance_after >= 0),
  reserved_balance_after integer not null check (reserved_balance_after >= 0),
  idempotency_key uuid not null unique,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index studio_credit_transactions_user_idx on public.studio_credit_transactions(user_id, created_at desc);

create table public.studio_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index studio_notifications_user_idx on public.studio_notifications(user_id, created_at desc);

create table public.studio_admin_actions (
  id uuid primary key default gen_random_uuid(),
  action_key uuid not null unique,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table public.studio_security_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'studio-payment-proofs',
  'studio-payment-proofs',
  false,
  52428800,
  array['image/jpeg','image/png','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.studio_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger studio_plans_touch before update on public.studio_plans
for each row execute function public.studio_touch_updated_at();
create trigger studio_payment_methods_touch before update on public.studio_payment_methods
for each row execute function public.studio_touch_updated_at();
create trigger studio_orders_touch before update on public.studio_orders
for each row execute function public.studio_touch_updated_at();
create trigger studio_subscriptions_touch before update on public.studio_subscriptions
for each row execute function public.studio_touch_updated_at();
create trigger studio_wallets_touch before update on public.studio_credit_wallets
for each row execute function public.studio_touch_updated_at();
create trigger studio_batches_touch before update on public.studio_credit_batches
for each row execute function public.studio_touch_updated_at();

create or replace function public.studio_is_admin_id(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id
      and lower(coalesce(role,'')) in ('admin','administrator','superadmin')
  );
$$;

create or replace function public.studio_expire_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_available integer;
  v_expired_orders integer;
  v_expired_subscriptions integer;
  v_expired_credits integer := 0;
begin
  update public.studio_orders
     set status = 'expired', revision = revision + 1
   where status in ('pending_payment','waiting_proof','proof_received','under_review','additional_proof_required')
     and expires_at <= now();
  get diagnostics v_expired_orders = row_count;

  update public.studio_subscriptions
     set status = 'expired'
   where status in ('active','expiring_soon') and expires_at <= now();
  get diagnostics v_expired_subscriptions = row_count;

  for r in
    select * from public.studio_credit_batches
     where status = 'active' and expires_at <= now() and (remaining_credits > 0 or reserved_credits = 0)
     for update skip locked
  loop
    if r.remaining_credits > 0 then
      update public.studio_credit_wallets
         set available_credits = greatest(0, available_credits - r.remaining_credits),
             expired_credits = expired_credits + r.remaining_credits,
             revision = revision + 1
       where user_id = r.user_id
       returning available_credits into v_available;
      insert into public.studio_credit_transactions(
        user_id,batch_id,order_id,operation,amount,available_balance_after,reserved_balance_after,
        idempotency_key,reason,metadata
      )
      select r.user_id,r.id,r.source_order_id,'expire',r.remaining_credits,v_available,reserved_credits,
             r.id,'Expiration du lot de crédits','{}'::jsonb
        from public.studio_credit_wallets where user_id = r.user_id
      on conflict (idempotency_key) do nothing;
      v_expired_credits := v_expired_credits + r.remaining_credits;
    end if;
    update public.studio_credit_batches
       set remaining_credits = 0,
           status = case when reserved_credits > 0 then 'cancelled' else 'expired' end
     where id = r.id;
  end loop;

  return jsonb_build_object(
    'expired_orders',v_expired_orders,
    'expired_subscriptions',v_expired_subscriptions,
    'expired_credits',v_expired_credits
  );
end;
$$;

create or replace function public.studio_create_order(
  p_user_id uuid,
  p_plan_id uuid,
  p_payment_method_id uuid,
  p_idempotency_key uuid,
  p_ip inet,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.studio_plans%rowtype;
  v_method public.studio_payment_methods%rowtype;
  v_order public.studio_orders%rowtype;
  v_existing public.studio_orders%rowtype;
  v_reference text;
  v_deadline timestamptz;
begin
  perform public.studio_expire_records();

  select * into v_existing from public.studio_orders
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_method from public.studio_payment_methods where id = v_existing.payment_method_id;
    return jsonb_build_object('order',to_jsonb(v_existing) - 'created_ip' - 'user_agent','payment_method',to_jsonb(v_method));
  end if;

  select * into v_plan from public.studio_plans
   where id = p_plan_id and active and available_for_sale and not archived
     and (starts_at is null or starts_at <= now())
     and (ends_at is null or ends_at > now())
     and (sales_limit is null or sold_count < sales_limit)
   for share;
  if not found then raise exception 'plan_unavailable'; end if;

  select * into v_method from public.studio_payment_methods
   where id = p_payment_method_id and active
   for share;
  if not found then raise exception 'payment_method_unavailable'; end if;

  v_reference := 'SAI-' || to_char(now(),'YYYY') || '-' ||
    lpad(nextval('public.studio_order_reference_seq')::text,6,'0');
  v_deadline := now() + make_interval(hours => v_method.proof_deadline_hours);

  insert into public.studio_orders(
    reference,user_id,plan_id,plan_snapshot,expected_amount_dzd,payment_method_id,
    status,idempotency_key,proof_deadline_at,expires_at,created_ip,user_agent
  ) values (
    v_reference,p_user_id,v_plan.id,
    jsonb_build_object(
      'id',v_plan.id,'slug',v_plan.slug,'name',v_plan.name,'description',v_plan.description,
      'price_dzd',v_plan.price_dzd,'included_credits',v_plan.included_credits,
      'background_removals',v_plan.background_removals,'validity_days',v_plan.validity_days,
      'quality',v_plan.quality,'max_file_size_bytes',v_plan.max_file_size_bytes,
      'max_image_side',v_plan.max_image_side,'concurrent_jobs',v_plan.concurrent_jobs,
      'batch_allowed',v_plan.batch_allowed,'max_batch_images',v_plan.max_batch_images,
      'retention_days',v_plan.retention_days,'features',v_plan.features,'badge',v_plan.badge
    ),
    v_plan.price_dzd,v_method.id,'pending_payment',p_idempotency_key,v_deadline,v_deadline,p_ip,
    left(coalesce(p_user_agent,''),500)
  ) returning * into v_order;

  insert into public.studio_notifications(user_id,notification_type,title,message,data)
  values (
    p_user_id,'order_created','Commande Studio IA créée',
    'Effectuez le paiement CCP puis envoyez votre justificatif.',
    jsonb_build_object('order_id',v_order.id,'reference',v_order.reference)
  );

  return jsonb_build_object(
    'order',to_jsonb(v_order) - 'created_ip' - 'user_agent',
    'payment_method',to_jsonb(v_method)
  );
end;
$$;

create or replace function public.studio_submit_proof_record(
  p_user_id uuid,
  p_order_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_payer_name text,
  p_payer_phone text,
  p_amount numeric,
  p_payment_date date,
  p_payment_time time,
  p_receipt_reference text,
  p_payment_channel text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.studio_orders%rowtype;
  v_proof public.studio_payment_proofs%rowtype;
begin
  select * into v_order from public.studio_orders where id = p_order_id for update;
  if not found or v_order.user_id <> p_user_id then raise exception 'order_not_found'; end if;
  if v_order.expires_at <= now() then
    update public.studio_orders set status='expired',revision=revision+1 where id=p_order_id;
    raise exception 'order_expired';
  end if;
  if v_order.status not in ('pending_payment','waiting_proof','additional_proof_required','rejected') then
    raise exception 'proof_not_allowed';
  end if;
  if exists(select 1 from public.studio_payment_proofs where sha256=p_sha256 and order_id<>p_order_id and status<>'rejected') then
    raise exception 'proof_already_used';
  end if;

  update public.studio_payment_proofs
     set is_current=false,status='replaced'
   where order_id=p_order_id and is_current;

  insert into public.studio_payment_proofs(
    order_id,user_id,storage_path,original_name,mime_type,size_bytes,sha256
  ) values (
    p_order_id,p_user_id,p_storage_path,left(p_original_name,180),p_mime_type,p_size_bytes,p_sha256
  ) returning * into v_proof;

  update public.studio_orders
     set status='proof_received',
         payer_name=left(p_payer_name,160),
         payer_phone=left(p_payer_phone,40),
         declared_amount_dzd=p_amount,
         payment_date=p_payment_date,
         payment_time=p_payment_time,
         receipt_reference=left(p_receipt_reference,120),
         payment_channel=left(p_payment_channel,60),
         client_comment=left(coalesce(p_comment,''),1500),
         rejection_reason=null,
         revision=revision+1
   where id=p_order_id
   returning * into v_order;

  insert into public.studio_notifications(user_id,notification_type,title,message,data)
  values (
    p_user_id,'proof_received','Preuve de paiement reçue',
    'Votre demande est en attente de vérification par un administrateur.',
    jsonb_build_object('order_id',p_order_id,'reference',v_order.reference)
  );

  return jsonb_build_object('order',to_jsonb(v_order)-'created_ip'-'user_agent','proof_id',v_proof.id);
end;
$$;

create or replace function public.studio_admin_transition(
  p_admin_id uuid,
  p_order_id uuid,
  p_action text,
  p_expected_revision bigint,
  p_action_key uuid,
  p_reason text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.studio_orders%rowtype;
  v_target text;
begin
  if not public.studio_is_admin_id(p_admin_id) then raise exception 'admin_required'; end if;
  if exists(select 1 from public.studio_admin_actions where action_key=p_action_key) then
    return (select to_jsonb(o)-'created_ip'-'user_agent' from public.studio_orders o where o.id=p_order_id);
  end if;

  select * into v_order from public.studio_orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.revision <> p_expected_revision then raise exception 'revision_conflict'; end if;
  if v_order.status in ('paid','cancelled','expired') then raise exception 'terminal_order'; end if;

  v_target := case p_action
    when 'review' then 'under_review'
    when 'reject' then 'rejected'
    when 'request_proof' then 'additional_proof_required'
    when 'suspicious' then 'suspicious'
    else null
  end;
  if v_target is null then raise exception 'invalid_action'; end if;

  update public.studio_orders
     set status=v_target,
         review_note=left(coalesce(p_note,''),2000),
         rejection_reason=case when v_target='rejected' then left(coalesce(p_reason,'Autre raison'),500) else rejection_reason end,
         revision=revision+1
   where id=p_order_id
   returning * into v_order;

  update public.studio_payment_proofs
     set status=case when v_target='under_review' then 'under_review'
                     when v_target='rejected' then 'rejected'
                     else status end,
         reviewed_by=p_admin_id,
         reviewed_at=case when v_target in ('under_review','rejected') then now() else reviewed_at end,
         review_note=left(coalesce(p_note,p_reason,''),1000)
   where order_id=p_order_id and is_current;

  insert into public.studio_admin_actions(action_key,admin_id,action,entity_type,entity_id,old_value,new_value,reason)
  values (
    p_action_key,p_admin_id,p_action,'studio_order',p_order_id,
    jsonb_build_object('status',v_order.status,'revision',p_expected_revision),
    jsonb_build_object('status',v_target,'revision',v_order.revision),
    left(coalesce(p_reason,p_note,''),1000)
  );

  insert into public.studio_notifications(user_id,notification_type,title,message,data)
  values (
    v_order.user_id,'payment_'||v_target,
    case v_target when 'under_review' then 'Paiement en cours de vérification'
                  when 'rejected' then 'Paiement non validé'
                  when 'additional_proof_required' then 'Nouvelle preuve nécessaire'
                  else 'Paiement signalé pour vérification' end,
    coalesce(nullif(p_note,''),nullif(p_reason,''),'Votre demande a été mise à jour.'),
    jsonb_build_object('order_id',p_order_id,'reference',v_order.reference,'status',v_target)
  );

  return to_jsonb(v_order)-'created_ip'-'user_agent';
end;
$$;

create or replace function public.studio_admin_approve(
  p_admin_id uuid,
  p_order_id uuid,
  p_expected_revision bigint,
  p_action_key uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.studio_orders%rowtype;
  v_subscription public.studio_subscriptions%rowtype;
  v_batch public.studio_credit_batches%rowtype;
  v_credits integer;
  v_days integer;
  v_available integer;
  v_reserved integer;
  v_carry boolean;
begin
  if not public.studio_is_admin_id(p_admin_id) then raise exception 'admin_required'; end if;
  if exists(select 1 from public.studio_admin_actions where action_key=p_action_key) then
    select available_credits,reserved_credits into v_available,v_reserved
      from public.studio_credit_wallets where user_id=(select user_id from public.studio_orders where id=p_order_id);
    return jsonb_build_object('idempotent',true,'available_credits',coalesce(v_available,0),'reserved_credits',coalesce(v_reserved,0));
  end if;

  select * into v_order from public.studio_orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.revision <> p_expected_revision then raise exception 'revision_conflict'; end if;
  if v_order.status not in ('proof_received','under_review') then raise exception 'approval_not_allowed'; end if;
  if v_order.expires_at <= now() then
    update public.studio_orders set status='expired',revision=revision+1 where id=p_order_id;
    raise exception 'order_expired';
  end if;
  if not exists(select 1 from public.studio_payment_proofs where order_id=p_order_id and is_current) then
    raise exception 'proof_required';
  end if;

  v_credits := greatest(1,(v_order.plan_snapshot->>'included_credits')::integer);
  v_days := greatest(1,(v_order.plan_snapshot->>'validity_days')::integer);
  select coalesce((value->>'enabled')::boolean,true) into v_carry
    from public.studio_settings where key='credit_carryover';

  if not coalesce(v_carry,true) then
    perform public.studio_expire_records();
    update public.studio_credit_batches
       set status='cancelled',remaining_credits=0
     where user_id=v_order.user_id and status='active' and remaining_credits>0;
    update public.studio_credit_wallets
       set expired_credits=expired_credits+available_credits,available_credits=0,revision=revision+1
     where user_id=v_order.user_id;
  end if;

  update public.studio_subscriptions
     set status='cancelled'
   where user_id=v_order.user_id and status in ('active','expiring_soon');

  insert into public.studio_subscriptions(
    user_id,plan_id,source_order_id,plan_snapshot,status,starts_at,expires_at,activated_by,activated_at
  ) values (
    v_order.user_id,v_order.plan_id,v_order.id,v_order.plan_snapshot,'active',now(),
    now()+make_interval(days=>v_days),p_admin_id,now()
  ) returning * into v_subscription;

  insert into public.studio_credit_wallets(user_id,available_credits)
  values(v_order.user_id,v_credits)
  on conflict(user_id) do update set
    available_credits=public.studio_credit_wallets.available_credits+excluded.available_credits,
    revision=public.studio_credit_wallets.revision+1
  returning available_credits,reserved_credits into v_available,v_reserved;

  insert into public.studio_credit_batches(
    user_id,subscription_id,source_order_id,original_credits,remaining_credits,expires_at
  ) values (
    v_order.user_id,v_subscription.id,v_order.id,v_credits,v_credits,v_subscription.expires_at
  ) returning * into v_batch;

  insert into public.studio_credit_transactions(
    user_id,batch_id,order_id,operation,amount,available_balance_after,reserved_balance_after,
    idempotency_key,reason,actor_id,metadata
  ) values (
    v_order.user_id,v_batch.id,v_order.id,'grant',v_credits,v_available,v_reserved,
    p_action_key,'Pack activé après validation CCP',p_admin_id,
    jsonb_build_object('subscription_id',v_subscription.id,'plan_id',v_order.plan_id)
  );

  update public.studio_payment_proofs
     set status='approved',reviewed_by=p_admin_id,reviewed_at=now(),review_note=left(coalesce(p_note,''),1000)
   where order_id=p_order_id and is_current;

  update public.studio_orders
     set status='paid',approved_by=p_admin_id,approved_at=now(),
         receipt_number='SAI-R-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.studio_order_reference_seq')::text,6,'0'),
         review_note=left(coalesce(p_note,''),2000),revision=revision+1
   where id=p_order_id
   returning * into v_order;

  update public.studio_plans set sold_count=sold_count+1 where id=v_order.plan_id;

  insert into public.studio_admin_actions(action_key,admin_id,action,entity_type,entity_id,old_value,new_value,reason)
  values (
    p_action_key,p_admin_id,'approve','studio_order',p_order_id,
    jsonb_build_object('status','under_review'),
    jsonb_build_object('status','paid','subscription_id',v_subscription.id,'credits',v_credits),
    left(coalesce(p_note,''),1000)
  );

  insert into public.studio_notifications(user_id,notification_type,title,message,data)
  values (
    v_order.user_id,'pack_activated','Pack Studio IA activé',
    'Votre paiement a été validé. Votre pack est maintenant actif.',
    jsonb_build_object('order_id',v_order.id,'subscription_id',v_subscription.id,'credits',v_credits)
  );

  return jsonb_build_object(
    'order',to_jsonb(v_order)-'created_ip'-'user_agent',
    'subscription',to_jsonb(v_subscription),
    'available_credits',v_available,
    'reserved_credits',v_reserved
  );
end;
$$;

create or replace function public.studio_reserve_credit(
  p_user_id uuid,
  p_request_key uuid,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_batch_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.studio_subscriptions%rowtype;
  v_batch public.studio_credit_batches%rowtype;
  v_job public.studio_image_jobs%rowtype;
  v_available integer;
  v_reserved integer;
  v_concurrent integer;
  v_plan jsonb;
  v_existing public.studio_image_jobs%rowtype;
begin
  perform public.studio_expire_records();

  select * into v_existing from public.studio_image_jobs
   where user_id=p_user_id and request_key=p_request_key;
  if found then
    select available_credits,reserved_credits into v_available,v_reserved
      from public.studio_credit_wallets where user_id=p_user_id;
    return jsonb_build_object('job_id',v_existing.id,'status',v_existing.status,'available_credits',coalesce(v_available,0),'reserved_credits',coalesce(v_reserved,0),'idempotent',true);
  end if;

  select * into v_subscription from public.studio_subscriptions
   where user_id=p_user_id and status in ('active','expiring_soon') and starts_at<=now() and expires_at>now()
   order by activated_at desc limit 1 for update;
  if not found then raise exception 'active_pack_required'; end if;
  v_plan := v_subscription.plan_snapshot;

  if p_mime_type not in ('image/png','image/jpeg','image/webp') then raise exception 'format_not_allowed'; end if;
  if p_file_size_bytes > coalesce((v_plan->>'max_file_size_bytes')::bigint,10485760) then raise exception 'file_too_large_for_plan'; end if;
  if greatest(p_width,p_height) > coalesce((v_plan->>'max_image_side')::integer,6000) then raise exception 'resolution_too_large_for_plan'; end if;
  if p_batch_count > 1 and not coalesce((v_plan->>'batch_allowed')::boolean,false) then raise exception 'batch_not_allowed'; end if;
  if p_batch_count > coalesce((v_plan->>'max_batch_images')::integer,1) then raise exception 'batch_limit_exceeded'; end if;

  select count(*) into v_concurrent from public.studio_image_jobs
   where user_id=p_user_id and status in ('reserved','processing');
  if v_concurrent >= coalesce((v_plan->>'concurrent_jobs')::integer,1) then raise exception 'concurrency_limit_reached'; end if;

  select available_credits,reserved_credits into v_available,v_reserved
    from public.studio_credit_wallets where user_id=p_user_id for update;
  if not found or v_available < 1 then raise exception 'credit_required'; end if;

  select * into v_batch from public.studio_credit_batches
   where user_id=p_user_id and status='active' and remaining_credits>0 and expires_at>now()
   order by expires_at,id limit 1 for update;
  if not found then raise exception 'credit_batch_required'; end if;

  update public.studio_credit_batches
     set remaining_credits=remaining_credits-1,reserved_credits=reserved_credits+1
   where id=v_batch.id;

  update public.studio_credit_wallets
     set available_credits=available_credits-1,reserved_credits=reserved_credits+1,revision=revision+1
   where user_id=p_user_id
   returning available_credits,reserved_credits into v_available,v_reserved;

  insert into public.studio_image_jobs(
    user_id,subscription_id,credit_batch_id,request_key,mime_type,file_size_bytes,width,height,batch_count
  ) values (
    p_user_id,v_subscription.id,v_batch.id,p_request_key,p_mime_type,p_file_size_bytes,p_width,p_height,p_batch_count
  ) returning * into v_job;

  insert into public.studio_credit_transactions(
    user_id,batch_id,image_job_id,operation,amount,available_balance_after,reserved_balance_after,
    idempotency_key,reason,metadata
  ) values (
    p_user_id,v_batch.id,v_job.id,'reserve',1,v_available,v_reserved,p_request_key,
    'Crédit réservé avant le détourage',jsonb_build_object('subscription_id',v_subscription.id)
  );

  return jsonb_build_object('job_id',v_job.id,'status',v_job.status,'available_credits',v_available,'reserved_credits',v_reserved,'idempotent',false);
end;
$$;

create or replace function public.studio_mark_job_processing(p_user_id uuid,p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.studio_image_jobs
     set status='processing',processing_at=coalesce(processing_at,now())
   where id=p_job_id and user_id=p_user_id and status='reserved';
end;
$$;

create or replace function public.studio_finalize_credit(
  p_user_id uuid,
  p_job_id uuid,
  p_success boolean,
  p_provider_request_id text,
  p_failure_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.studio_image_jobs%rowtype;
  v_available integer;
  v_reserved integer;
  v_cost numeric(12,4);
begin
  select * into v_job from public.studio_image_jobs
   where id=p_job_id and user_id=p_user_id for update;
  if not found then raise exception 'job_not_found'; end if;

  select available_credits,reserved_credits into v_available,v_reserved
    from public.studio_credit_wallets where user_id=p_user_id for update;

  if v_job.status in ('succeeded','failed','refunded','cancelled') then
    return jsonb_build_object('job_id',v_job.id,'status',v_job.status,'available_credits',v_available,'reserved_credits',v_reserved,'idempotent',true);
  end if;

  if p_success then
    select coalesce((value->>'value')::numeric,6.8) into v_cost
      from public.studio_settings where key='image_cost_dzd';
    v_cost := coalesce(v_cost,6.8);

    update public.studio_credit_batches
       set reserved_credits=greatest(0,reserved_credits-1),
           status=case when remaining_credits=0 and reserved_credits<=1 then 'consumed' else status end
     where id=v_job.credit_batch_id;

    update public.studio_credit_wallets
       set reserved_credits=greatest(0,reserved_credits-1),consumed_credits=consumed_credits+1,revision=revision+1
     where user_id=p_user_id
     returning available_credits,reserved_credits into v_available,v_reserved;

    update public.studio_image_jobs
       set status='succeeded',provider_request_id=left(coalesce(p_provider_request_id,''),180),
           cost_dzd=v_cost,completed_at=now()
     where id=p_job_id;

    insert into public.studio_credit_transactions(
      user_id,batch_id,image_job_id,operation,amount,available_balance_after,reserved_balance_after,
      idempotency_key,reason,metadata
    ) values (
      p_user_id,v_job.credit_batch_id,p_job_id,'consume',1,v_available,v_reserved,p_job_id,
      'Détourage PhotoRoom réussi',jsonb_build_object('cost_dzd',v_cost,'provider','photoroom')
    ) on conflict(idempotency_key) do nothing;

    return jsonb_build_object('job_id',p_job_id,'status','succeeded','available_credits',v_available,'reserved_credits',v_reserved,'cost_dzd',v_cost,'idempotent',false);
  end if;

  update public.studio_credit_batches
     set reserved_credits=greatest(0,reserved_credits-1),remaining_credits=remaining_credits+1,status='active'
   where id=v_job.credit_batch_id;

  update public.studio_credit_wallets
     set reserved_credits=greatest(0,reserved_credits-1),available_credits=available_credits+1,revision=revision+1
   where user_id=p_user_id
   returning available_credits,reserved_credits into v_available,v_reserved;

  update public.studio_image_jobs
     set status='refunded',failure_code=left(coalesce(p_failure_code,'processing_failed'),180),completed_at=now()
   where id=p_job_id;

  insert into public.studio_credit_transactions(
    user_id,batch_id,image_job_id,operation,amount,available_balance_after,reserved_balance_after,
    idempotency_key,reason,metadata
  ) values (
    p_user_id,v_job.credit_batch_id,p_job_id,'refund',1,v_available,v_reserved,p_job_id,
    'Crédit restitué après échec technique',jsonb_build_object('failure_code',p_failure_code)
  ) on conflict(idempotency_key) do nothing;

  return jsonb_build_object('job_id',p_job_id,'status','refunded','available_credits',v_available,'reserved_credits',v_reserved,'idempotent',false);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'studio_settings','studio_plans','studio_payment_methods','studio_orders',
    'studio_payment_proofs','studio_subscriptions','studio_credit_wallets',
    'studio_credit_batches','studio_image_jobs','studio_credit_transactions',
    'studio_notifications','studio_admin_actions','studio_security_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;

create policy studio_plans_catalog on public.studio_plans
for select to anon,authenticated
using (
  active and available_for_sale and not archived
  and (starts_at is null or starts_at<=now())
  and (ends_at is null or ends_at>now())
  and (sales_limit is null or sold_count<sales_limit)
);
grant select on public.studio_plans to anon,authenticated;

create policy studio_orders_owner on public.studio_orders
for select to authenticated using (user_id=auth.uid());
create policy studio_proofs_owner on public.studio_payment_proofs
for select to authenticated using (user_id=auth.uid());
create policy studio_subscriptions_owner on public.studio_subscriptions
for select to authenticated using (user_id=auth.uid());
create policy studio_wallet_owner on public.studio_credit_wallets
for select to authenticated using (user_id=auth.uid());
create policy studio_batches_owner on public.studio_credit_batches
for select to authenticated using (user_id=auth.uid());
create policy studio_jobs_owner on public.studio_image_jobs
for select to authenticated using (user_id=auth.uid());
create policy studio_transactions_owner on public.studio_credit_transactions
for select to authenticated using (user_id=auth.uid());
create policy studio_notifications_owner on public.studio_notifications
for select to authenticated using (user_id=auth.uid());

revoke all on function public.studio_is_admin_id(uuid) from public,anon,authenticated;
revoke all on function public.studio_expire_records() from public,anon,authenticated;
revoke all on function public.studio_create_order(uuid,uuid,uuid,uuid,inet,text) from public,anon,authenticated;
revoke all on function public.studio_submit_proof_record(uuid,uuid,text,text,text,bigint,text,text,text,numeric,date,time,text,text,text) from public,anon,authenticated;
revoke all on function public.studio_admin_transition(uuid,uuid,text,bigint,uuid,text,text) from public,anon,authenticated;
revoke all on function public.studio_admin_approve(uuid,uuid,bigint,uuid,text) from public,anon,authenticated;
revoke all on function public.studio_reserve_credit(uuid,uuid,text,bigint,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.studio_mark_job_processing(uuid,uuid) from public,anon,authenticated;
revoke all on function public.studio_finalize_credit(uuid,uuid,boolean,text,text) from public,anon,authenticated;

grant execute on function public.studio_is_admin_id(uuid) to service_role;
grant execute on function public.studio_expire_records() to service_role;
grant execute on function public.studio_create_order(uuid,uuid,uuid,uuid,inet,text) to service_role;
grant execute on function public.studio_submit_proof_record(uuid,uuid,text,text,text,bigint,text,text,text,numeric,date,time,text,text,text) to service_role;
grant execute on function public.studio_admin_transition(uuid,uuid,text,bigint,uuid,text,text) to service_role;
grant execute on function public.studio_admin_approve(uuid,uuid,bigint,uuid,text) to service_role;
grant execute on function public.studio_reserve_credit(uuid,uuid,text,bigint,integer,integer,integer) to service_role;
grant execute on function public.studio_mark_job_processing(uuid,uuid) to service_role;
grant execute on function public.studio_finalize_credit(uuid,uuid,boolean,text,text) to service_role;

grant usage,select on sequence public.studio_order_reference_seq to service_role;