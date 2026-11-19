-- Lead-waiting alerts and messages sent from the platform admin
-- reuse the existing notifications inbox.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'deal_reminder',
    'lead_awaiting',
    'platform_message'
  ));
