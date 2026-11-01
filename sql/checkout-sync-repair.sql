CREATE OR REPLACE FUNCTION public.cf_checkout_player(p_session_id uuid,p_player_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $func$
DECLARE v_status text; v_before jsonb;v_after jsonb;v_removed integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cf_admins WHERE user_id=(SELECT auth.uid())) THEN RAISE EXCEPTION 'Organizer permission required';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,0));
 SELECT status INTO v_status FROM public.cf_sessions WHERE id=p_session_id;
 IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Event is not active';END IF;
 IF EXISTS(SELECT 1 FROM public.cf_match_players mp JOIN public.cf_matches m ON m.id=mp.match_id WHERE m.session_id=p_session_id AND m.status='playing' AND mp.player_id=p_player_id)
 THEN RAISE EXCEPTION 'Player is on a live court. Finish or correct the match before checkout';END IF;
 SELECT entries INTO v_before FROM public.cf_event_queues WHERE session_id=p_session_id FOR UPDATE;
 IF v_before IS NOT NULL THEN
  SELECT COALESCE(jsonb_agg(entry ORDER BY ord),'[]'::jsonb) INTO v_after
  FROM jsonb_array_elements(v_before) WITH ORDINALITY AS j(entry,ord)
  WHERE NOT (
   (entry->>'kind'='open' AND (entry->'team_a' ? p_player_id::text OR entry->'team_b' ? p_player_id::text))
   OR (entry->>'kind'='ranked' AND EXISTS(SELECT 1 FROM public.cf_ranked_fixtures f WHERE f.id=(entry->>'fixture_id')::uuid AND p_player_id=ANY(f.team_a||f.team_b)))
  );
  v_removed:=jsonb_array_length(v_before)-jsonb_array_length(v_after);
  IF v_removed>0 THEN UPDATE public.cf_event_queues SET entries=v_after,version=version+1,updated_at=now() WHERE session_id=p_session_id;END IF;
 END IF;
 UPDATE public.cf_attendance SET checked_in=false,paused=false WHERE session_id=p_session_id AND player_id=p_player_id AND checked_in=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Player is not checked in';END IF;
 RETURN jsonb_build_object('status','checked_out','player_id',p_player_id,'removed_provisional_matches',v_removed);
END
$func$;
REVOKE ALL ON FUNCTION public.cf_checkout_player(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cf_checkout_player(uuid,uuid) TO authenticated;