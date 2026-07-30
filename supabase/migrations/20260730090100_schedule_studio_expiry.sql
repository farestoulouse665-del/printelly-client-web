create extension if not exists pg_cron;
do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='studio-expire-records-hourly'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
  perform cron.schedule(
    'studio-expire-records-hourly',
    '15 * * * *',
    'select public.studio_expire_records();'
  );
end $$;