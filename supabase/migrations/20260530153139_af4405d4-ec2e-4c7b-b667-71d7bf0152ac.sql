
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'student');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  class_level TEXT,
  blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Batches
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  class_level TEXT NOT NULL,
  subjects TEXT[] NOT NULL DEFAULT '{}',
  mentors TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_price NUMERIC(10,2),
  thumbnail_url TEXT,
  enrollment_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT ALL ON public.batches TO service_role;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

-- Lectures
CREATE TABLE public.lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  duration_minutes INT,
  order_index INT NOT NULL DEFAULT 0,
  is_live BOOLEAN NOT NULL DEFAULT false,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lectures TO authenticated;
GRANT ALL ON public.lectures TO service_role;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;

-- Materials
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'pdf',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Enrollments
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  progress_percent INT NOT NULL DEFAULT 0,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, batch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- batches
CREATE POLICY "Anyone authenticated views batches" ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage batches insert" ON public.batches FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage batches update" ON public.batches FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage batches delete" ON public.batches FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- lectures
CREATE POLICY "Auth views lectures" ON public.lectures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert lectures" ON public.lectures FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update lectures" ON public.lectures FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete lectures" ON public.lectures FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- materials
CREATE POLICY "Auth views materials" ON public.materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert materials" ON public.materials FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update materials" ON public.materials FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete materials" ON public.materials FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- enrollments
CREATE POLICY "Students view own enrollments" ON public.enrollments FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students enroll themselves" ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students update own enrollments" ON public.enrollments FOR UPDATE TO authenticated
  USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete enrollments" ON public.enrollments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + assign student role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, class_level)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'class_level'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_batches_updated BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lectures_updated BEFORE UPDATE ON public.lectures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
