-- Test transactionnel à exécuter sur une base de recette contenant un profil admin et un profil client.
-- Toutes les données créées sont annulées par ROLLBACK.
begin;
create temporary table studio_billing_test_result(result jsonb) on commit drop;
do $$
declare
  v_admin uuid; v_client uuid; v_plan uuid:=gen_random_uuid(); v_method uuid:=gen_random_uuid();
  v_order uuid; v_job uuid; v_revision bigint; v_action_key uuid:=gen_random_uuid();
  v_created jsonb; v_approved jsonb; v_second jsonb; v_reserved jsonb; v_refunded jsonb;
begin
  select id into v_admin from public.profiles where lower(role) in ('admin','administrator','superadmin') limit 1;
  select id into v_client from public.profiles where lower(role)='client' limit 1;
  if v_admin is null or v_client is null then raise exception 'test_profiles_missing'; end if;

  insert into public.studio_plans(id,slug,name,price_dzd,included_credits,background_removals,validity_days,max_file_size_bytes,max_image_side,concurrent_jobs,active,available_for_sale,created_by,updated_by)
  values(v_plan,'test-'||substr(v_plan::text,1,8),'Pack test',100,5,5,30,10485760,6000,1,true,true,v_admin,v_admin);
  insert into public.studio_payment_methods(id,method_type,label,account_holder,ccp_number,active,created_by,updated_by)
  values(v_method,'ccp','CCP test','PRINTELLY TEST','00000000',true,v_admin,v_admin);

  v_created:=public.studio_create_order(v_client,v_plan,v_method,gen_random_uuid(),null,'studio-test');
  v_order:=(v_created->'order'->>'id')::uuid;
  if (v_created->'order'->>'status')<>'pending_payment' then raise exception 'order_creation_failed'; end if;

  perform public.studio_submit_proof_record(v_client,v_order,'test/proof.png','proof.png','image/png',64,encode(digest(v_order::text,'sha256'),'hex'),'Client','0550000000',100,current_date,localtime(0),'TEST','CCP','');
  select revision into v_revision from public.studio_orders where id=v_order;
  v_approved:=public.studio_admin_approve(v_admin,v_order,v_revision,v_action_key,'Test');
  v_second:=public.studio_admin_approve(v_admin,v_order,v_revision,v_action_key,'Test doublon');
  if (v_approved->>'available_credits')::int<>5 or not (v_second->>'idempotent')::boolean then raise exception 'approval_idempotency_failed'; end if;

  v_reserved:=public.studio_reserve_credit(v_client,gen_random_uuid(),'image/png',2048,1000,1000,1);
  v_job:=(v_reserved->>'job_id')::uuid;
  v_refunded:=public.studio_finalize_credit(v_client,v_job,false,'','test_failure');
  if (v_refunded->>'available_credits')::int<>5 or (v_refunded->>'reserved_credits')::int<>0 then raise exception 'refund_failed'; end if;

  insert into studio_billing_test_result values(jsonb_build_object('order','pending_payment','proof','proof_received','approval','paid','idempotent',true,'refund',true));
end $$;
select result from studio_billing_test_result;
rollback;
