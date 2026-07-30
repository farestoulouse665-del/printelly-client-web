create or replace function public.studio_expire_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.studio_credit_batches%rowtype;
  v_available integer;
  v_expired_orders integer := 0;
  v_expired_subscriptions integer := 0;
  v_expired_credits integer := 0;
begin
  update public.studio_orders
     set status='expired',revision=revision+1
   where status in ('pending_payment','waiting_proof') and expires_at<=now();
  get diagnostics v_expired_orders = row_count;

  update public.studio_subscriptions
     set status='expired'
   where status in ('active','expiring_soon') and expires_at<=now();
  get diagnostics v_expired_subscriptions = row_count;

  for r in
    select * from public.studio_credit_batches
     where status='active' and expires_at<=now()
     for update skip locked
  loop
    if r.remaining_credits>0 then
      update public.studio_credit_wallets
         set available_credits=greatest(0,available_credits-r.remaining_credits),
             expired_credits=expired_credits+r.remaining_credits,
             revision=revision+1
       where user_id=r.user_id
       returning available_credits into v_available;
      insert into public.studio_credit_transactions(
        user_id,batch_id,order_id,operation,amount,available_balance_after,reserved_balance_after,
        idempotency_key,reason,metadata
      )
      select r.user_id,r.id,r.source_order_id,'expire',r.remaining_credits,v_available,reserved_credits,
             r.id,'Expiration du lot de crédits','{}'::jsonb
        from public.studio_credit_wallets where user_id=r.user_id
      on conflict(idempotency_key) do nothing;
      v_expired_credits:=v_expired_credits+r.remaining_credits;
    end if;
    update public.studio_credit_batches
       set remaining_credits=0,
           status=case when reserved_credits>0 then 'cancelled' else 'expired' end
     where id=r.id;
  end loop;

  return jsonb_build_object('expired_orders',v_expired_orders,'expired_subscriptions',v_expired_subscriptions,'expired_credits',v_expired_credits);
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
  v_batch public.studio_credit_batches%rowtype;
  v_available integer;
  v_reserved integer;
  v_cost numeric(12,4);
  v_expired_refund boolean := false;
begin
  select * into v_job from public.studio_image_jobs where id=p_job_id and user_id=p_user_id for update;
  if not found then raise exception 'job_not_found'; end if;

  select * into v_batch from public.studio_credit_batches where id=v_job.credit_batch_id for update;
  select available_credits,reserved_credits into v_available,v_reserved from public.studio_credit_wallets where user_id=p_user_id for update;

  if v_job.status in ('succeeded','failed','refunded','cancelled') then
    return jsonb_build_object('job_id',v_job.id,'status',v_job.status,'available_credits',v_available,'reserved_credits',v_reserved,'idempotent',true);
  end if;

  if p_success then
    select coalesce((value->>'value')::numeric,6.8) into v_cost from public.studio_settings where key='image_cost_dzd';
    v_cost:=coalesce(v_cost,6.8);
    update public.studio_credit_batches
       set reserved_credits=greatest(0,reserved_credits-1),
           status=case when remaining_credits=0 and reserved_credits<=1 then 'consumed' else status end
     where id=v_job.credit_batch_id;
    update public.studio_credit_wallets
       set reserved_credits=greatest(0,reserved_credits-1),consumed_credits=consumed_credits+1,revision=revision+1
     where user_id=p_user_id returning available_credits,reserved_credits into v_available,v_reserved;
    update public.studio_image_jobs
       set status='succeeded',provider_request_id=left(coalesce(p_provider_request_id,''),180),cost_dzd=v_cost,completed_at=now()
     where id=p_job_id;
    insert into public.studio_credit_transactions(
      user_id,batch_id,image_job_id,operation,amount,available_balance_after,reserved_balance_after,idempotency_key,reason,metadata
    ) values (
      p_user_id,v_job.credit_batch_id,p_job_id,'consume',1,v_available,v_reserved,p_job_id,
      'Détourage PhotoRoom réussi',jsonb_build_object('cost_dzd',v_cost,'provider','photoroom')
    ) on conflict(idempotency_key) do nothing;
    return jsonb_build_object('job_id',p_job_id,'status','succeeded','available_credits',v_available,'reserved_credits',v_reserved,'cost_dzd',v_cost,'idempotent',false);
  end if;

  v_expired_refund:=v_batch.expires_at<=now() or v_batch.status in ('expired','cancelled');
  if v_expired_refund then
    update public.studio_credit_batches
       set reserved_credits=greatest(0,reserved_credits-1),status='expired'
     where id=v_job.credit_batch_id;
    update public.studio_credit_wallets
       set reserved_credits=greatest(0,reserved_credits-1),expired_credits=expired_credits+1,revision=revision+1
     where user_id=p_user_id returning available_credits,reserved_credits into v_available,v_reserved;
  else
    update public.studio_credit_batches
       set reserved_credits=greatest(0,reserved_credits-1),remaining_credits=remaining_credits+1,status='active'
     where id=v_job.credit_batch_id;
    update public.studio_credit_wallets
       set reserved_credits=greatest(0,reserved_credits-1),available_credits=available_credits+1,revision=revision+1
     where user_id=p_user_id returning available_credits,reserved_credits into v_available,v_reserved;
  end if;

  update public.studio_image_jobs
     set status='refunded',failure_code=left(coalesce(p_failure_code,'processing_failed'),180),completed_at=now()
   where id=p_job_id;
  insert into public.studio_credit_transactions(
    user_id,batch_id,image_job_id,operation,amount,available_balance_after,reserved_balance_after,idempotency_key,reason,metadata
  ) values (
    p_user_id,v_job.credit_batch_id,p_job_id,'refund',1,v_available,v_reserved,p_job_id,
    case when v_expired_refund then 'Crédit échoué classé expiré après fin du pack' else 'Crédit restitué après échec technique' end,
    jsonb_build_object('failure_code',p_failure_code,'expired',v_expired_refund)
  ) on conflict(idempotency_key) do nothing;
  return jsonb_build_object('job_id',p_job_id,'status','refunded','available_credits',v_available,'reserved_credits',v_reserved,'expired',v_expired_refund,'idempotent',false);
end;
$$;

revoke all on function public.studio_touch_updated_at() from public,anon,authenticated;
grant execute on function public.studio_touch_updated_at() to service_role;

drop policy if exists studio_orders_owner on public.studio_orders;
create policy studio_orders_owner on public.studio_orders for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists studio_proofs_owner on public.studio_payment_proofs;
create policy studio_proofs_owner on public.studio_payment_proofs for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists studio_subscriptions_owner on public.studio_subscriptions;
create policy studio_subscriptions_owner on public.studio_subscriptions for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists studio_wallet_owner on public.studio_credit_wallets;
create policy studio_wallet_owner on public.studio_credit_wallets for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists studio_batches_owner on public.studio_credit_batches;
create policy studio_batches_owner on public.studio_credit_batches for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists studio_jobs_owner on public.studio_image_jobs;
create policy studio_jobs_owner on public.studio_image_jobs for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists studio_transactions_owner on public.studio_credit_transactions;
create policy studio_transactions_owner on public.studio_credit_transactions for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists studio_notifications_owner on public.studio_notifications;
create policy studio_notifications_owner on public.studio_notifications for select to authenticated using (user_id=(select auth.uid()));

revoke all on function public.studio_expire_records() from public,anon,authenticated;
revoke all on function public.studio_finalize_credit(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.studio_expire_records() to service_role;
grant execute on function public.studio_finalize_credit(uuid,uuid,boolean,text,text) to service_role;
