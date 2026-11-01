-- CourtFlow event-level provisional dispatch queue (not assigned to any court).
CREATE TABLE IF NOT EXISTS public.cf_event_queues (
 session_id uuid PRIMARY KEY REFERENCES public.cf_sessions(id) ON DELETE CASCADE,
 entries jsonb NOT NULL DEFAULT '[]'::jsonb,
 version bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT cf_event_queue_items_check CHECK (
   jsonb_typeof(entries)='array' AND jsonb_array_length(entries)<=3
 )
);
ALTER TABLE public.cf_event_queues ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cf_event_queues TO anon,authenticated;
GRANT INSERT,UPDATE ON public.cf_event_queues TO authenticated;
DROP POLICY IF EXISTS "cf_event_queue_public_read" ON public.cf_event_queues;
CREATE POLICY "cf_event_queue_public_read" ON public.cf_event_queues
 FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "cf_event_queue_organizer_write" ON public.cf_event_queues;
CREATE POLICY "cf_event_queue_organizer_write" ON public.cf_event_queues
 FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cf_admins WHERE user_id=(SELECT auth.uid())))
 WITH CHECK (EXISTS(SELECT 1 FROM public.cf_admins WHERE user_id=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.cf_event_queue_set(
 p_session_id uuid,p_expected_version bigint,p_entries jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE
 v_mode text;v_status text;v_version bigint;v_entry jsonb;v_kind text;
 v_fixture uuid;v_team_a uuid[];v_team_b uuid[];v_ids uuid[];v_match uuid;
 v_count int;v_seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cf_admins WHERE user_id=(SELECT auth.uid())) THEN
   RAISE EXCEPTION 'Organizer permission required';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,0));
 SELECT mode,status INTO v_mode,v_status FROM public.cf_sessions WHERE id=p_session_id;
 IF NOT FOUND OR v_status<>'active' THEN RAISE EXCEPTION 'Select an active event'; END IF;
 IF p_entries IS NULL OR pg_catalog.jsonb_typeof(p_entries)<>'array'
    OR pg_catalog.jsonb_array_length(p_entries)>3 THEN
   RAISE EXCEPTION 'Queue must contain zero to three entries';
 END IF;
 INSERT INTO public.cf_event_queues(session_id) VALUES(p_session_id) ON CONFLICT DO NOTHING;
 SELECT version INTO v_version FROM public.cf_event_queues WHERE session_id=p_session_id FOR UPDATE;
 IF v_version IS DISTINCT FROM p_expected_version THEN
   RAISE EXCEPTION 'Queue changed. Refresh before editing.';
 END IF;
 FOR v_entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_entries)
 LOOP
   v_kind:=v_entry->>'kind';v_team_a:=NULL;v_team_b:=NULL;
   IF v_kind='ranked' THEN
     IF v_mode<>'ranked_4' OR NOT(v_entry ? 'fixture_id') THEN
       RAISE EXCEPTION 'Ranked queues must reference scheduled fixtures';
     END IF;
     v_fixture:=(v_entry->>'fixture_id')::uuid;
     IF v_fixture=ANY(v_seen) THEN RAISE EXCEPTION 'Duplicate queued fixture'; END IF;
     v_seen:=pg_catalog.array_append(v_seen,v_fixture);
     SELECT team_a,team_b,match_id INTO v_team_a,v_team_b,v_match
     FROM public.cf_ranked_fixtures WHERE id=v_fixture AND session_id=p_session_id;
     IF NOT FOUND OR v_match IS NOT NULL THEN
       RAISE EXCEPTION 'Selected Ranked fixture is no longer available';
     END IF;
   ELSIF v_kind='open' THEN
     IF v_mode='ranked_4' OR pg_catalog.jsonb_typeof(v_entry->'team_a')<>'array'
        OR pg_catalog.jsonb_typeof(v_entry->'team_b')<>'array' THEN
       RAISE EXCEPTION 'Choose four players for an open-play queue entry';
     END IF;
     SELECT pg_catalog.array_agg(value::uuid) INTO v_team_a
       FROM pg_catalog.jsonb_array_elements_text(v_entry->'team_a') AS x(value);
     SELECT pg_catalog.array_agg(value::uuid) INTO v_team_b
       FROM pg_catalog.jsonb_array_elements_text(v_entry->'team_b') AS x(value);
   ELSE RAISE EXCEPTION 'Unknown queue entry type'; END IF;
   v_ids:=v_team_a||v_team_b;
   IF pg_catalog.cardinality(v_team_a)<>2 OR pg_catalog.cardinality(v_team_b)<>2
       OR (SELECT count(DISTINCT x) FROM pg_catalog.unnest(v_ids) AS x)<>4 THEN
     RAISE EXCEPTION 'Every queued match needs four distinct players';
   END IF;
   SELECT count(*) INTO v_count FROM public.cf_attendance a
      JOIN public.cf_players p ON p.id=a.player_id
      WHERE a.session_id=p_session_id AND a.player_id=ANY(v_ids)
        AND a.checked_in AND NOT a.paused AND p.active;
   IF v_count<>4 THEN RAISE EXCEPTION 'All staged players must be checked in and active'; END IF;
 END LOOP;
 UPDATE public.cf_event_queues SET entries=p_entries,version=version+1,updated_at=now()
 WHERE session_id=p_session_id;
 RETURN pg_catalog.jsonb_build_object('version',v_version+1,'entries',p_entries);
END
$fn$;

CREATE OR REPLACE FUNCTION public.cf_event_queue_dispatch(
 p_session_id uuid,p_court_number integer,p_expected_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE
 v_mode text;v_courts int;v_status text;v_entries jsonb;v_version bigint;
 v_first jsonb;v_match uuid;v_team_a uuid[];v_team_b uuid[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cf_admins WHERE user_id=(SELECT auth.uid())) THEN
   RAISE EXCEPTION 'Organizer permission required';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,0));
 SELECT mode,courts,status INTO v_mode,v_courts,v_status
   FROM public.cf_sessions WHERE id=p_session_id;
 IF NOT FOUND OR v_status<>'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;
 IF p_court_number IS NULL OR p_court_number<1 OR p_court_number>v_courts THEN
   RAISE EXCEPTION 'Invalid available court';
 END IF;
 SELECT entries,version INTO v_entries,v_version FROM public.cf_event_queues
 WHERE session_id=p_session_id FOR UPDATE;
 IF NOT FOUND OR pg_catalog.jsonb_array_length(v_entries)=0 THEN
   RAISE EXCEPTION 'No staged match in the event queue';
 END IF;
 IF v_version IS DISTINCT FROM p_expected_version THEN
   RAISE EXCEPTION 'Queue changed. Refresh before starting.';
 END IF;
 v_first:=v_entries->0;
 IF v_first->>'kind'='ranked' THEN
   IF v_mode<>'ranked_4' THEN RAISE EXCEPTION 'Invalid Ranked event queue'; END IF;
   v_match:=public.cf_ranked_start_fixture((v_first->>'fixture_id')::uuid,p_court_number);
 ELSIF v_first->>'kind'='open' THEN
   IF v_mode='ranked_4' THEN RAISE EXCEPTION 'Ranked fixtures must be used'; END IF;
   SELECT pg_catalog.array_agg(value::uuid) INTO v_team_a
     FROM pg_catalog.jsonb_array_elements_text(v_first->'team_a') AS x(value);
   SELECT pg_catalog.array_agg(value::uuid) INTO v_team_b
     FROM pg_catalog.jsonb_array_elements_text(v_first->'team_b') AS x(value);
   v_match:=public.cf_start_match(p_session_id,p_court_number,v_team_a,v_team_b);
 ELSE RAISE EXCEPTION 'Invalid queue entry'; END IF;
 UPDATE public.cf_event_queues
 SET entries=v_entries-0,version=version+1,updated_at=now()
 WHERE session_id=p_session_id;
 RETURN pg_catalog.jsonb_build_object(
   'match_id',v_match,'court_number',p_court_number,
   'version',v_version+1,'dispatched',v_first,'remaining',pg_catalog.jsonb_array_length(v_entries)-1
 );
END
$fn$;

REVOKE ALL ON FUNCTION public.cf_event_queue_set(uuid,bigint,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cf_event_queue_dispatch(uuid,integer,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cf_event_queue_set(uuid,bigint,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_event_queue_dispatch(uuid,integer,bigint) TO authenticated;
