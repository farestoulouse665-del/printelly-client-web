create or replace function public.studio_expire_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.studio_credit_batches%rowtype;
  v_available integer;
  v_expired_orders integer:=0;
  v_expired_subscriptions integer:=0;
  v_expired_credits integer:=0;
begin
  update public.studio_orders
     set status='expired',revision=revision+1
   where status in ('pending_payment','waiting_proof','proof_received','under_review','additional_proof_required','suspicious')
     and expires_at<=now();
  get diagnostics v_expired_orders=row_count;
  update public.studio_subscriptions set status='expired'
   where status in ('active','expiring_soon') and expires_at<=now();
  get diagnostics v_expired_subscriptions=row_count;
  for r in select * from public.studio_credit_batches where status='active' and expires_at<=now() for update skip locked loop
    if r.remaining_credits>0 then
      update public.studio_credit_wallets
         set available_credits=greatest(0,available_credits-r.remaining_credits),expired_credits=expired_credits+r.remaining_credits,revision=revision+1
       where user_id=r.user_id returning available_credits into v_available;
      insert into public.studio_credit_transactions(user_id,batch_id,order_id,operation,amount,available_balance_after,reserved_balance_after,idempotency_key,reason,metadata)
      select r.user_id,r.id,r.source_order_id,'expire',r.remaining_credits,v_available,reserved_credits,r.id,'Expiration du lot de crédits','{}'::jsonb
        from public.studio_credit_wallets where user_id=r.user_id on conflict(idempotency_key) do nothing;
      v_expired_credits:=v_expired_credits+r.remaining_credits;
    end if;
    update public.studio_credit_batches set remaining_credits=0,status=case when reserved_credits>0 then 'cancelled' else 'expired' end where id=r.id;
  end loop;
  return jsonb_build_object('expired_orders',v_expired_orders,'expired_subscriptions',v_expired_subscriptions,'expired_credits',v_expired_credits);
end;
$$;

create or replace function public.studio_submit_proof_record(
  p_user_id uuid,p_order_id uuid,p_storage_path text,p_original_name text,p_mime_type text,
  p_size_bytes bigint,p_sha256 text,p_payer_name text,p_payer_phone text,p_amount numeric,
  p_payment_date date,p_payment_time time,p_receipt_reference text,p_payment_channel text,p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.studio_orders%rowtype;
  v_proof public.studio_payment_proofs%rowtype;
  v_average_hours integer;
  v_review_hours integer;
begin
  perform public.studio_expire_records();
  select * into v_order from public.studio_orders where id=p_order_id for update;
  if not found or v_order.user_id<>p_user_id then raise exception 'order_not_found'; end if;
  if v_order.status='expired' or v_order.proof_deadline_at<=now() and v_order.status in ('pending_payment','waiting_proof') then raise exception 'order_expired'; end if;
  if v_order.status not in ('pending_payment','waiting_proof','additional_proof_required','rejected') then raise exception 'proof_not_allowed'; end if;
  if exists(select 1 from public.studio_payment_proofs where sha256=p_sha256 and order_id<>p_order_id and status<>'rejected') then raise exception 'proof_already_used'; end if;

  select average_validation_hours into v_average_hours from public.studio_payment_methods where id=v_order.payment_method_id;
  v_review_hours:=greatest(72,least(720,coalesce(v_average_hours,24)*4));
  update public.studio_payment_proofs set is_current=false,status='replaced' where order_id=p_order_id and is_current;
  insert into public.studio_payment_proofs(order_id,user_id,storage_path,original_name,mime_type,size_bytes,sha256)
  values(p_order_id,p_user_id,p_storage_path,left(p_original_name,180),p_mime_type,p_size_bytes,p_sha256) returning * into v_proof;
  update public.studio_orders
     set status='proof_received',payer_name=left(p_payer_name,160),payer_phone=left(p_payer_phone,40),
         declared_amount_dzd=p_amount,payment_date=p_payment_date,payment_time=p_payment_time,
         receipt_reference=left(p_receipt_reference,120),payment_channel=left(p_payment_channel,60),
         client_comment=left(coalesce(p_comment,''),1500),rejection_reason=null,
         expires_at=now()+make_interval(hours=>v_review_hours),revision=revision+1
   where id=p_order_id returning * into v_order;
  insert into public.studio_notifications(user_id,notification_type,title,message,data)
  values(p_user_id,'proof_received','Preuve de paiement reçue','Votre demande est en attente de vérification par un administrateur.',jsonb_build_object('order_id',p_order_id,'reference',v_order.reference));
  return jsonb_build_object('order',to_jsonb(v_order)-'created_ip'-'user_agent','proof_id',v_proof.id,'review_deadline_at',v_order.expires_at);
end;
$$;

revoke all on function public.studio_expire_records() from public,anon,authenticated;
revoke all on function public.studio_submit_proof_record(uuid,uuid,text,text,text,bigint,text,text,text,numeric,date,time,text,text,text) from public,anon,authenticated;
grant execute on function public.studio_expire_records() to service_role;
grant execute on function public.studio_submit_proof_record(uuid,uuid,text,text,text,bigint,text,text,text,numeric,date,time,text,text,text) to service_role;
