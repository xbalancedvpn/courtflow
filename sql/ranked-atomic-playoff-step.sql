CREATE OR REPLACE FUNCTION public.cf_ranked_commit_step(
 p_bracket_id uuid,
 p_expected_round integer,
 p_expected_engine jsonb,
 p_next_engine jsonb,
 p_action text,
 p_fixtures jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $fn$
DECLARE
 v_session uuid; v_bracket public.cf_ranked_brackets%ROWTYPE;
 v_round integer; v_count integer; v_total integer; v_unique integer;
 v_current jsonb; v_completed boolean; a record; v_award_player uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cf_admins WHERE user_id=(SELECT auth.uid())) THEN
   RAISE EXCEPTION 'Organizer permission required';
 END IF;
 SELECT session_id INTO v_session FROM public.cf_ranked_brackets WHERE id=p_bracket_id;
 IF v_session IS NULL THEN RAISE EXCEPTION 'Bracket not found'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_session::text,0));
 SELECT * INTO v_bracket FROM public.cf_ranked_brackets WHERE id=p_bracket_id FOR UPDATE;
 IF NOT FOUND OR v_bracket.status<>'active' THEN RAISE EXCEPTION 'Bracket is not active'; END IF;
 IF v_bracket.round_no IS DISTINCT FROM p_expected_round
    OR COALESCE(v_bracket.meta->'engine','null'::jsonb)
       <> COALESCE(p_expected_engine,'null'::jsonb) THEN
   RAISE EXCEPTION 'Bracket changed. Refresh and retry.';
 END IF;
 IF pg_catalog.jsonb_typeof(p_next_engine)<>'object'
    OR pg_catalog.jsonb_typeof(p_next_engine->'jobs')<>'array'
    OR pg_catalog.jsonb_typeof(p_next_engine->'awards')<>'array' THEN
   RAISE EXCEPTION 'Invalid playoff engine state';
 END IF;
 IF p_action='draw' THEN
   IF pg_catalog.jsonb_typeof(p_fixtures)<>'array' THEN RAISE EXCEPTION 'Fixtures must be a JSON array'; END IF;
   v_count:=pg_catalog.jsonb_array_length(p_fixtures);
   IF v_count<1 OR v_count>16 THEN RAISE EXCEPTION 'Invalid playoff wave size'; END IF;
   IF pg_catalog.jsonb_typeof(p_next_engine->'current')<>'object' THEN
     RAISE EXCEPTION 'A draw must establish an active placement job';
   END IF;
   IF COALESCE(v_bracket.meta->'engine'->'current','null'::jsonb)<>'null'::jsonb THEN
     RAISE EXCEPTION 'Previous placement wave is still active';
   END IF;
   IF EXISTS(
     SELECT 1 FROM public.cf_ranked_fixtures f LEFT JOIN public.cf_matches m ON m.id=f.match_id
     WHERE f.bracket_id=p_bracket_id AND (f.match_id IS NULL OR m.status<>'completed')
   ) THEN RAISE EXCEPTION 'Complete previous playoff fixtures before drawing'; END IF;
   SELECT count(*),count(DISTINCT contender) INTO v_total,v_unique FROM (
     SELECT pg_catalog.unnest(f.contenders) AS contender
     FROM pg_catalog.jsonb_to_recordset(p_fixtures) AS f(seq_no int,kind text,team_a uuid[],team_b uuid[],contenders uuid[])
   ) x;
   IF v_total<>pg_catalog.jsonb_array_length(p_next_engine->'current'->'ids')
      OR v_unique<>v_total THEN
     RAISE EXCEPTION 'Every contender must appear exactly once in the wave';
   END IF;
   IF EXISTS(
     SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_fixtures)
       AS f(seq_no int,kind text,team_a uuid[],team_b uuid[],contenders uuid[])
     WHERE pg_catalog.cardinality(f.team_a)<>2 OR pg_catalog.cardinality(f.team_b)<>2
        OR (SELECT count(DISTINCT u) FROM pg_catalog.unnest(f.team_a||f.team_b) u)<>4
        OR EXISTS(SELECT 1 FROM pg_catalog.unnest(f.contenders) c
                  WHERE NOT pg_catalog.to_jsonb(c::text)<@p_next_engine->'current'->'ids')
   ) THEN RAISE EXCEPTION 'Invalid player assignment in playoff wave'; END IF;
   SELECT COALESCE(MAX(round_no)+1,1) INTO v_round
     FROM public.cf_ranked_fixtures WHERE bracket_id=p_bracket_id;
   INSERT INTO public.cf_ranked_fixtures(
     session_id,phase,round_no,bracket_id,seq_no,kind,team_a,team_b,contenders
   )
   SELECT v_session,'playoff',v_round,p_bracket_id,f.seq_no,f.kind,f.team_a,f.team_b,f.contenders
   FROM pg_catalog.jsonb_to_recordset(p_fixtures)
        AS f(seq_no int,kind text,team_a uuid[],team_b uuid[],contenders uuid[]);
   UPDATE public.cf_ranked_brackets
   SET round_no=v_round,meta=pg_catalog.jsonb_set(COALESCE(meta,'{}'::jsonb),'{engine}',p_next_engine,true)
   WHERE id=p_bracket_id;
   RETURN pg_catalog.jsonb_build_object('status','drawn','round_no',v_round,'matches',v_count);
 ELSIF p_action='settle' THEN
   IF COALESCE(v_bracket.meta->'engine'->'current','null'::jsonb)='null'::jsonb THEN
     RAISE EXCEPTION 'No active placement wave to settle';
   END IF;
   IF COALESCE(p_next_engine->'current','null'::jsonb)<>'null'::jsonb THEN
     RAISE EXCEPTION 'Settlement must clear the active placement job';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.cf_ranked_fixtures
                 WHERE bracket_id=p_bracket_id AND round_no=v_bracket.round_no) THEN
     RAISE EXCEPTION 'Current wave has no fixtures';
   END IF;
   IF EXISTS(
     SELECT 1 FROM public.cf_ranked_fixtures f LEFT JOIN public.cf_matches m ON m.id=f.match_id
     WHERE f.bracket_id=p_bracket_id AND f.round_no=v_bracket.round_no
       AND (f.match_id IS NULL OR m.status<>'completed')
   ) THEN RAISE EXCEPTION 'Finish all matches before advancing placement'; END IF;
   FOR a IN SELECT * FROM pg_catalog.jsonb_to_recordset(p_next_engine->'awards')
       AS x(placement int,player_id uuid)
   LOOP
     IF a.placement<v_bracket.rank_start
        OR a.placement>=v_bracket.rank_start+v_bracket.slots
        OR NOT a.player_id=ANY(v_bracket.contenders) THEN
       RAISE EXCEPTION 'Award is outside the active bracket';
     END IF;
     INSERT INTO public.cf_ranked_awards(session_id,placement,player_id)
     VALUES(v_session,a.placement,a.player_id) ON CONFLICT(session_id,placement) DO NOTHING;
     SELECT player_id INTO v_award_player
       FROM public.cf_ranked_awards WHERE session_id=v_session AND placement=a.placement;
     IF v_award_player IS DISTINCT FROM a.player_id THEN
       RAISE EXCEPTION 'Award conflict; refresh before proceeding';
     END IF;
   END LOOP;
   v_completed=pg_catalog.jsonb_array_length(p_next_engine->'jobs')=0;
   UPDATE public.cf_ranked_brackets
   SET meta=pg_catalog.jsonb_set(COALESCE(meta,'{}'::jsonb),'{engine}',p_next_engine,true),
       status=CASE WHEN v_completed THEN 'completed' ELSE 'active' END,
       state=CASE WHEN v_completed THEN 'finished' ELSE state END
   WHERE id=p_bracket_id;
   RETURN pg_catalog.jsonb_build_object('status',CASE WHEN v_completed THEN 'completed' ELSE 'settled' END,
                                         'round_no',v_bracket.round_no,'awards',pg_catalog.jsonb_array_length(p_next_engine->'awards'));
 ELSE
   RAISE EXCEPTION 'Invalid playoff action';
 END IF;
END
$fn$;
REVOKE ALL ON FUNCTION public.cf_ranked_commit_step(uuid,integer,jsonb,jsonb,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cf_ranked_commit_step(uuid,integer,jsonb,jsonb,text,jsonb) TO authenticated;