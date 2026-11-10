-- Removes the groups that `npm run check-access` leaves behind (named "access-check", made only by the check's own
-- anonymous sign-ins, which are tagged app=docuhop, purpose=access-check). Everything in them cascades. The sign-ins
-- themselves are then removed by the daily docuhop-retention job (no group left). Touches dh_ tables only.
delete from public.dh_nights n
where n.name = 'access-check'
  and exists (select 1 from auth.users u where u.id = n.created_by and u.raw_user_meta_data ->> 'purpose' = 'access-check');
select count(*) as access_check_groups_left from public.dh_nights where name = 'access-check';
