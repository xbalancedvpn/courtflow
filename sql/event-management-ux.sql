-- CourtFlow release: event management, safe check-out and audited lineup corrections
ALTER TABLE public.cf_sessions
 ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cf_match_participant_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.cf_sessions(id) ON DELETE CASCADE,
 match_id uuid NOT NULL REFERENCES public.cf_matches(id) ON DELETE CASCADE,
 old_player_id uuid NOT NULL REFERENCES public.cf_players(id),
 new_player_id uuid NOT NULL REFERENCES public.cf_players(id),
 team smallint NOT NULL CHECK(team IN (1,2)),
 reason text NOT NULL,
 changed_by uuid REFERENCES auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cf_match_participant_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.cf_match_participant_audit TO authenticated;
DROP POLICY IF EXISTS "cf_participant_audit_admin" ON public.cf_match_participant_audit;
CREATE POLICY "cf_participant_audit_admin" ON public.cf_match_participant_audit
 FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.cf_admins a WHERE a.user_id=(SELECT auth.uid())))
 WITH CHECK (EXISTS (SELECT 1 FROM public.cf_admins a WHERE a.user_id=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.cf_event_manage(
 p_session_id uuid,
 p_action text,
 p_title text DEFAULT NULL,
 p_session_date date DEFAULT NULL,
 p_courts integer DEFAULT NULL,
 p_confirm_title text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $func$
DECLARE v_event public.cf_sessions%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cf_admins a WHERE a.user_id=(SELECT auth.uid())) THEN
   RAISE EXCEPTION 'Organizer permission required';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,0));
 SELECT * INTO v_event FROM public.cf_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF p_action='edit' THEN
   IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_title,'')))<3 OR
      pg_catalog.length(pg_catalog.btrim(p_title))>120 THEN
     RAISE EXCEPTION 'Event name must be 3 to 120 characters'; END IF;
   IF p_session_date IS NULL OR p_courts IS NULL OR p_courts NOT BETWEEN 1 AND 10
     THEN RAISE EXCEPTION 'Choose a valid date and court count'; END IF;
   IF EXISTS(SELECT 1 FROM public.cf_matches
      WHERE session_id=p_session_id AND court_number>p_courts) THEN
     RAISE EXCEPTION 'Cannot reduce courts below an existing match court number'; END IF;
   UPDATE public.cf_sessions SET title=pg_catalog.btrim(p_title),session_date=p_session_date,courts=p_courts
     WHERE id=p_session_id;
 ELSIF p_action IN ('archive','close') THEN
   IF EXISTS(SELECT 1 FROM public.cf_matches WHERE session_id=p_session_id AND status='playing')
   THEN RAISE EXCEPTION 'Finish all live matches before closing or archiving'; END IF;
   UPDATE public.cf_sessions SET status='closed',
     is_archived=CASE WHEN p_action='archive' THEN true ELSE is_archived END
   WHERE id=p_session_id;
 ELSIF p_action='restore' THEN
   UPDATE public.cf_sessions SET is_archived=false WHERE id=p_session_id;
 ELSIF p_action='reopen' THEN
   UPDATE public.cf_sessions SET status='active',is_archived=false WHERE id=p_session_id;
 ELSIF p_action='delete' THEN
   IF p_confirm_title IS DISTINCT FROM v_event.title THEN
     RAISE EXCEPTION 'Type the exact event name to confirm deletion'; END IF;
   IF EXISTS(SELECT 1 FROM public.cf_matches WHERE session_id=p_session_id) OR
      EXISTS(SELECT 1 FROM public.cf_ranked_fixtures WHERE session_id=p_session_id) OR
      EXISTS(SELECT 1 FROM public.cf_ranked_awards WHERE session_id=p_session_id)
      THEN RAISE EXCEPTION 'Event has match or Ranked history. Archive instead of deleting.'; END IF;
   DELETE FROM public.cf_event_queues WHERE session_id=p_session_id;
   DELETE FROM public.cf_ranked_supporters WHERE session_id=p_session_id;
   DELETE FROM public.cf_ranked_roster WHERE session_id=p_session_id;
   DELETE FROM public.cf_attendance WHERE session_id=p_session_id;
   DELETE FROM public.cf_sessions WHERE id=p_session_id;
   RETURN pg_catalog.jsonb_build_object('status','deleted','id',p_session_id);
 ELSE RAISE EXCEPTION 'Unknown event action'; END IF;
 RETURN pg_catalog.jsonb_build_object('status',p_action,'id',p_session_id);
END
$func$;

CREATE OR REPLACE FUNCTION public.cf_checkout_player(
 p_session_id uuid,p_player_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $func$
DECLARE v_queue jsonb;v_status text;v_queued boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cf_admins a WHERE a.user_id=(SELECT auth.uid())) THEN
   RAISE EXCEPTION 'Organizer permission required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,0));
 SELECT status INTO v_status FROM public.cf_sessions WHERE id=p_session_id;
 IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.cf_match_players mp JOIN public.cf_matches m ON m.id=mp.match_id
  WHERE m.session_id=p_session_id AND m.status='playing' AND mp.player_id=p_player_id
 ) THEN RAISE EXCEPTION 'Player is currently on a court. Finish or correct the match first'; END IF;
 SELECT entries INTO v_queue FROM public.cf_event_queues WHERE session_id=p_session_id;
 SELECT EXISTS(
  SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(v_queue,'[]'::jsonb)) j(value)
  LEFT JOIN public.cf_ranked_fixtures f ON f.id =
     CASE WHEN j.value->>'kind'='ranked' THEN (j.value->>'fixture_id')::uuid ELSE NULL END
  WHERE (j.value->>'kind'='open' AND (
    j.value->'team_a' ? p_player_id::text OR j.value->'team_b' ? p_player_id::text))
     OR (j.value->>'kind'='ranked' AND p_player_id=ANY(f.team_a||f.team_b))
 ) INTO v_queued;
 IF v_queued THEN RAISE EXCEPTION 'Player is in Next Court. Remove from provisional lineup first'; END IF;
 UPDATE public.cf_attendance SET checked_in=false,paused=false
 WHERE session_id=p_session_id AND player_id=p_player_id AND checked_in;
 IF NOT FOUND THEN RAISE EXCEPTION 'Player is not checked in'; END IF;
 RETURN pg_catalog.jsonb_build_object('status','checked_out','player_id',p_player_id);
END
$func$;

CREATE OR REPLACE FUNCTION public.cf_replace_playing_player(
 p_match_id uuid,p_old_player_id uuid,p_new_player_id uuid,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $func$
DECLARE v_match public.cf_matches%ROWTYPE;v_team integer;v_valid boolean;
 v_title text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cf_admins a WHERE a.user_id=(SELECT auth.uid())) THEN
   RAISE EXCEPTION 'Organizer permission required'; END IF;
 IF p_new_player_id IS NULL OR p_old_player_id IS NULL OR
   p_new_player_id=p_old_player_id THEN RAISE EXCEPTION 'Choose a different replacement player'; END IF;
 IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_reason,'')))<3 THEN
   RAISE EXCEPTION 'Provide a reason for replacing the player'; END IF;
 SELECT session_id INTO v_match.session_id FROM public.cf_matches WHERE id=p_match_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_match.session_id::text,0));
 SELECT * INTO v_match FROM public.cf_matches WHERE id=p_match_id FOR UPDATE;
 IF v_match.status<>'playing' THEN RAISE EXCEPTION 'Only playing matches can change their lineup'; END IF;
 IF v_match.mode='ranked_4' THEN
   RAISE EXCEPTION 'Ranked matches are locked to generated fixtures. Correct the schedule before starting a Ranked match'; END IF;
 SELECT team INTO v_team FROM public.cf_match_players WHERE match_id=p_match_id AND player_id=p_old_player_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original player is not assigned to this match'; END IF;
 IF EXISTS(SELECT 1 FROM public.cf_match_players WHERE match_id=p_match_id AND player_id=p_new_player_id)
   THEN RAISE EXCEPTION 'Replacement is already in this match'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.cf_attendance a
    JOIN public.cf_players p ON p.id=a.player_id
    WHERE a.session_id=v_match.session_id AND a.player_id=p_new_player_id
      AND a.checked_in AND NOT a.paused AND p.active) INTO v_valid;
 IF NOT v_valid THEN RAISE EXCEPTION 'Replacement must be active and checked in'; END IF;
 IF EXISTS(SELECT 1 FROM public.cf_match_players mp
   JOIN public.cf_matches m ON m.id=mp.match_id
   WHERE m.session_id=v_match.session_id AND m.status='playing' AND m.id<>p_match_id
     AND mp.player_id=p_new_player_id) THEN
   RAISE EXCEPTION 'Replacement player is already on another court'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.cf_event_queues q,
       pg_catalog.jsonb_array_elements(q.entries) item
   WHERE q.session_id=v_match.session_id AND item->>'kind'='open'
     AND (item->'team_a' ? p_new_player_id::text OR item->'team_b' ? p_new_player_id::text)
 ) THEN RAISE EXCEPTION 'Replacement is staged in Next Court. Edit the provisional queue first'; END IF;
 UPDATE public.cf_match_players SET player_id=p_new_player_id
  WHERE match_id=p_match_id AND player_id=p_old_player_id;
 INSERT INTO public.cf_match_participant_audit(
   session_id,match_id,old_player_id,new_player_id,team,reason,changed_by
 ) VALUES(v_match.session_id,p_match_id,p_old_player_id,p_new_player_id,v_team,
          pg_catalog.btrim(p_reason),(SELECT auth.uid()));
 RETURN pg_catalog.jsonb_build_object('status','updated','match_id',p_match_id,
    'old_player_id',p_old_player_id,'new_player_id',p_new_player_id);
END
$func$;

REVOKE ALL ON FUNCTION public.cf_event_manage(uuid,text,text,date,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cf_checkout_player(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cf_replace_playing_player(uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cf_event_manage(uuid,text,text,date,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_checkout_player(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_replace_playing_player(uuid,uuid,uuid,text) TO authenticated;
