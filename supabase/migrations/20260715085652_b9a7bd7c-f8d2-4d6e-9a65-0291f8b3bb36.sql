
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own subscriptions" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all subscriptions" ON public.push_subscriptions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE TRIGGER push_subs_updated_at BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TYPE public.notification_target AS ENUM ('all_students','batch','class_level','user');
CREATE TYPE public.notification_type AS ENUM ('new_lecture','live_class','new_pdf','extra_notes','community','master_ji','test_series','assignment','general');

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  redirect_url TEXT,
  button_text TEXT,
  type public.notification_type NOT NULL DEFAULT 'general',
  target_type public.notification_target NOT NULL DEFAULT 'all_students',
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  class_level TEXT,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own recipient rows" ON public.notification_recipients
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own recipient rows" ON public.notification_recipients
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own recipient rows" ON public.notification_recipients
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage recipient rows" ON public.notification_recipients
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_notif_recipients_user ON public.notification_recipients(user_id, read_at);

CREATE POLICY "Admins manage notifications" ON public.notifications
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Recipients read notifications" ON public.notifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.notification_recipients nr
            WHERE nr.notification_id = notifications.id AND nr.user_id = auth.uid())
  );
