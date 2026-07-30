-- PRINTELLY Studio AI: one secure free trial per authenticated client.
-- The trial uses the same atomic reserve/consume/refund ledger as paid packs.

alter table public.studio_credit_batches
  alter column subscription_id drop not null,
  alter column source_order_id drop not null,
  add column if not exists source text not null default 'paid';

alter table public.studio_image_jobs
  alter column subscription_id drop not null,
  add column if not exists credit_source text not null default 'paid';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'studio_credit_batches_source_check'
  ) then
    alter table public.studio_credit_batches
      add constraint studio_credit_batches_source_check
      check (source in ('paid','free_trial','promotional'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'studio_image_jobs_credit_source_check'
  ) then
    alter table public.studio_image_jobs
      add constraint studio_image_jobs_credit_source_check
      check (credit_source in ('paid','free_trial','promotional'));
  end if;
end $$;

create unique index if not exists studio_credit_batches_one_free_trial_per_user
  on public.studio_credit_batches(user_id)
  where source = 'free_trial';

create index if not exists studio_credit_batches_entitlement_lookup
  on public.studio_credit_batches(user_id, source, status, expires_at);

insert into public.studio_settings(key,value)
values (
  'free_trial',
  jsonb_build_object(
    'enabled', true,
    'credits', 1,
    'quality', 'HD',
    'max_file_size_bytes', 10485760,
    'max_image_side', 6000,
    'concurrent_jobs', 1,
    'batch_allowed', false,
    'max_batch_images', 1,
    'validity_days', 3650
  )
)
on conflict(key) do nothing;

create or replace function public.studio_entitlement_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_setting jsonb := '{}'::jsonb;
  v_enabled boolean := true;
  v_trial_credits integer := 1;
  v_validity_days integer := 3650;
  v_created_batch uuid;
  v_trial public.studio_credit_batches%rowtype;
  v_subscription public.studio_subscriptions%rowtype;
  v_wallet public.studio_credit_wallets%rowtype;
  v_paid_available integer := 0;
  v_eligible_available integer := 0;
  v_access_reason text := 'trial_exhausted';
  v_plan jsonb := '{}'::jsonb;
begin
  if p_user_id is null then raise exception 'session_required'; end if;

  perform public.studio_expire_records();

  select value into v_setting
    from public.studio_settings
   where key='free_trial';
  v_setting := coalesce(v_setting, '{}'::jsonb);
  v_enabled := coalesce((v_setting->>'enabled')::boolean, true);
  v_trial_credits := greatest(1, least(10, coalesce((v_setting->>'credits')::integer, 1)));
  v_validity_days := greatest(1, least(3650, coalesce((v_setting->>'validity_days')::integer, 3650)));

  insert into public.studio_credit_wallets(user_id)
  values (p_user_id)
  on conflict(user_id) do nothing;

  if v_enabled then
    insert into public.studio_credit_batches(
      user_id,subscription_id,source_order_id,source,
      original_credits,remaining_credits,reserved_credits,expires_at,status
    )
    values (
      p_user_id,null,null,'free_trial',
      v_trial_credits,v_trial_credits,0,now()+make_interval(days=>v_validity_days),'active'
    )
    on conflict(user_id) where source='free_trial' do nothing
    returning id into v_created_batch;

    if v_created_batch is not null then
      update public.studio_credit_wallets
         set available_credits=available_credits+v_trial_credits,
             revision=revision+1,
             updated_at=now()
       where user_id=p_user_id;

      insert into public.studio_credit_transactions(
        user_id,batch_id,operation,amount,available_balance_after,reserved_balance_after,
        idempotency_key,reason,metadata
      )
      select p_user_id,v_created_batch,'grant',v_trial_credits,
             available_credits,reserved_credits,v_created_batch,
             'Essai gratuit Studio AI',
             jsonb_build_object('credit_source','free_trial','automatic',true)
        from public.studio_credit_wallets
       where user_id=p_user_id
      on conflict(idempotency_key) do nothing;
    end if;
  end if;

  select * into v_trial
    from public.studio_credit_batches
   where user_id=p_user_id and source='free_trial'
   limit 1;

  select * into v_subscription
    from public.studio_subscriptions
   where user_id=p_user_id
     and status in ('active','expiring_soon')
     and starts_at<=now() and expires_at>now()
   order by activated_at desc
   limit 1;

  if v_subscription.id is not null then
    select coalesce(sum(remaining_credits),0)::integer into v_paid_available
      from public.studio_credit_batches
     where user_id=p_user_id
       and source in ('paid','promotional')
       and status='active' and expires_at>now()
       and (subscription_id=v_subscription.id or subscription_id is null);
  end if;

  v_eligible_available :=
    coalesce(case when v_trial.status='active' and v_trial.expires_at>now() then v_trial.remaining_credits else 0 end,0)
    + coalesce(v_paid_available,0);

  if coalesce(v_trial.remaining_credits,0)>0 and v_trial.status='active' and v_trial.expires_at>now() then
    v_access_reason := 'trial_available';
    v_plan := v_setting || jsonb_build_object('name','Essai gratuit','credits',v_trial_credits,'source','free_trial');
  elsif v_subscription.id is not null and v_paid_available>0 then
    v_access_reason := 'subscription_active';
    v_plan := coalesce(v_subscription.plan_snapshot,'{}'::jsonb) || jsonb_build_object('source','paid');
  elsif v_subscription.id is not null then
    v_access_reason := 'credits_exhausted';
    v_plan := coalesce(v_subscription.plan_snapshot,'{}'::jsonb) || jsonb_build_object('source','paid');
  elsif v_trial.id is not null then
    v_access_reason := 'trial_exhausted';
    v_plan := v_setting || jsonb_build_object('name','Essai gratuit','source','free_trial');
  elsif not v_enabled then
    v_access_reason := 'trial_disabled';
  end if;

  select * into v_wallet
    from public.studio_credit_wallets
   where user_id=p_user_id;

  return jsonb_build_object(
    'access_allowed', v_eligible_available>0,
    'access_reason', v_access_reason,
    'available', v_eligible_available,
    'wallet_available', coalesce(v_wallet.available_credits,0),
    'reserved', coalesce(v_wallet.reserved_credits,0),
    'consumed', coalesce(v_wallet.consumed_credits,0),
    'trial_enabled', v_enabled,
    'trial_available', coalesce(v_trial.remaining_credits,0),
    'trial_reserved', coalesce(v_trial.reserved_credits,0),
    'trial_consumed', greatest(0,coalesce(v_trial.original_credits,0)-coalesce(v_trial.remaining_credits,0)-coalesce(v_trial.reserved_credits,0)),
    'trial_granted', v_trial.id is not null,
    'paid_available', v_paid_available,
    'subscription', case when v_subscription.id is null then null else jsonb_build_object(
      'id',v_subscription.id,'status',v_subscription.status,
      'starts_at',v_subscription.starts_at,'expires_at',v_subscription.expires_at,
      'plan_snapshot',v_subscription.plan_snapshot
    ) end,
    'plan', v_plan
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
set search_path=''
as $$
declare
  v_entitlement jsonb;
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

  select * into v_existing
    from public.studio_image_jobs
   where user_id=p_user_id and request_key=p_request_key;
  if found then
    select available_credits,reserved_credits into v_available,v_reserved
      from public.studio_credit_wallets where user_id=p_user_id;
    return jsonb_build_object(
      'job_id',v_existing.id,'status',v_existing.status,
      'available_credits',coalesce(v_available,0),
      'reserved_credits',coalesce(v_reserved,0),
      'credit_source',v_existing.credit_source,
      'idempotent',true
    );
  end if;

  v_entitlement := public.studio_entitlement_status(p_user_id);

  select * into v_subscription
    from public.studio_subscriptions
   where user_id=p_user_id
     and status in ('active','expiring_soon')
     and starts_at<=now() and expires_at>now()
   order by activated_at desc
   limit 1;

  select * into v_batch
    from public.studio_credit_batches
   where user_id=p_user_id
     and status='active' and remaining_credits>0 and expires_at>now()
     and (
       source='free_trial'
       or (
         source in ('paid','promotional')
         and v_subscription.id is not null
         and (subscription_id=v_subscription.id or subscription_id is null)
       )
     )
   order by case when source='free_trial' then 0 else 1 end,expires_at,id
   limit 1
   for update;

  if not found then
    if v_subscription.id is null then raise exception 'trial_exhausted'; end if;
    raise exception 'credit_required';
  end if;

  if v_batch.source='free_trial' then
    select value into v_plan from public.studio_settings where key='free_trial';
    v_plan := coalesce(v_plan,'{}'::jsonb);
  else
    v_plan := coalesce(v_subscription.plan_snapshot,'{}'::jsonb);
  end if;

  if p_mime_type not in ('image/png','image/jpeg','image/webp') then raise exception 'format_not_allowed'; end if;
  if p_file_size_bytes > coalesce((v_plan->>'max_file_size_bytes')::bigint,10485760) then raise exception 'file_too_large_for_plan'; end if;
  if greatest(p_width,p_height) > coalesce((v_plan->>'max_image_side')::integer,6000) then raise exception 'resolution_too_large_for_plan'; end if;
  if p_batch_count > 1 and not coalesce((v_plan->>'batch_allowed')::boolean,false) then raise exception 'batch_not_allowed'; end if;
  if p_batch_count > coalesce((v_plan->>'max_batch_images')::integer,1) then raise exception 'batch_limit_exceeded'; end if;

  select count(*) into v_concurrent
    from public.studio_image_jobs
   where user_id=p_user_id and status in ('reserved','processing');
  if v_concurrent >= coalesce((v_plan->>'concurrent_jobs')::integer,1) then raise exception 'concurrency_limit_reached'; end if;

  select available_credits,reserved_credits into v_available,v_reserved
    from public.studio_credit_wallets
   where user_id=p_user_id
   for update;
  if not found or v_available<1 then raise exception 'credit_required'; end if;

  update public.studio_credit_batches
     set remaining_credits=remaining_credits-1,
         reserved_credits=reserved_credits+1,
         updated_at=now()
   where id=v_batch.id;

  update public.studio_credit_wallets
     set available_credits=available_credits-1,
         reserved_credits=reserved_credits+1,
         revision=revision+1,
         updated_at=now()
   where user_id=p_user_id
   returning available_credits,reserved_credits into v_available,v_reserved;

  insert into public.studio_image_jobs(
    user_id,subscription_id,credit_batch_id,credit_source,request_key,
    mime_type,file_size_bytes,width,height,batch_count
  )
  values (
    p_user_id,case when v_batch.source='free_trial' then null else v_subscription.id end,
    v_batch.id,v_batch.source,p_request_key,
    p_mime_type,p_file_size_bytes,p_width,p_height,p_batch_count
  )
  returning * into v_job;

  insert into public.studio_credit_transactions(
    user_id,batch_id,image_job_id,operation,amount,
    available_balance_after,reserved_balance_after,idempotency_key,reason,metadata
  )
  values (
    p_user_id,v_batch.id,v_job.id,'reserve',1,
    v_available,v_reserved,p_request_key,
    'Crédit réservé avant le détourage',
    jsonb_build_object('subscription_id',v_subscription.id,'credit_source',v_batch.source)
  );

  return jsonb_build_object(
    'job_id',v_job.id,'status',v_job.status,
    'available_credits',v_available,'reserved_credits',v_reserved,
    'credit_source',v_batch.source,'idempotent',false
  );
end;
$$;

revoke all on function public.studio_entitlement_status(uuid) from public,anon,authenticated;
revoke all on function public.studio_reserve_credit(uuid,uuid,text,bigint,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.studio_entitlement_status(uuid) to service_role;
grant execute on function public.studio_reserve_credit(uuid,uuid,text,bigint,integer,integer,integer) to service_role;

comment on function public.studio_entitlement_status(uuid)
is 'Creates at most one free-trial credit batch and returns server-authoritative Studio AI access.';
