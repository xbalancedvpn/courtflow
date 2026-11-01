-- Event lifecycle and accounting storage. Existing events keep their current statuses.
ALTER TABLE public.cf_sessions
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE public.cf_sessions DROP CONSTRAINT IF EXISTS cf_sessions_status_check;
ALTER TABLE public.cf_sessions
  ADD CONSTRAINT cf_sessions_status_check
  CHECK (status IN ('upcoming','active','closed'));
ALTER TABLE public.cf_sessions
  ALTER COLUMN status SET DEFAULT 'upcoming';
ALTER TABLE public.cf_sessions DROP CONSTRAINT IF EXISTS cf_sessions_fee_check;
ALTER TABLE public.cf_sessions
  ADD CONSTRAINT cf_sessions_fee_check CHECK (fee >= 0 AND fee <= 1000000);
CREATE TABLE IF NOT EXISTS public.cf_event_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES public.cf_sessions(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES public.cf_players(id),
 amount numeric(10,2) NOT NULL CHECK (amount > 0),
 method text NOT NULL CHECK (method IN ('cash','gcash','bank','other')),
 notes text NOT NULL DEFAULT '',
 paid_at timestamptz NOT NULL DEFAULT now(),
 recorded_by uuid NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS cf_event_payments_session_player_idx
 ON public.cf_event_payments(session_id,player_id,paid_at DESC);
ALTER TABLE public.cf_event_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cf_event_payments FROM anon;
GRANT SELECT,INSERT ON public.cf_event_payments TO authenticated;
DROP POLICY IF EXISTS cf_event_payments_organizer_select ON public.cf_event_payments;
CREATE POLICY cf_event_payments_organizer_select ON public.cf_event_payments
 FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cf_admins a WHERE a.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS cf_event_payments_organizer_insert ON public.cf_event_payments;
CREATE POLICY cf_event_payments_organizer_insert ON public.cf_event_payments
 FOR INSERT TO authenticated
 WITH CHECK (
    recorded_by=(SELECT auth.uid()) AND EXISTS(
      SELECT 1 FROM public.cf_admins a WHERE a.user_id=(SELECT auth.uid()))
 );
