ALTER TABLE public.extra_notes
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_source TEXT,
  ADD COLUMN IF NOT EXISTS book_author TEXT,
  ADD COLUMN IF NOT EXISTS book_isbn TEXT,
  ADD COLUMN IF NOT EXISTS book_publisher TEXT,
  ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_note_download(_note_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.extra_notes SET download_count = download_count + 1 WHERE id = _note_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_note_download(uuid) TO authenticated;