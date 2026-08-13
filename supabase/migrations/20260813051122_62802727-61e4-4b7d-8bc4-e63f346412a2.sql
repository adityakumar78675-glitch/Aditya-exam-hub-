-- Guest (anon) read access to public educational content

GRANT SELECT ON public.batches TO anon;
GRANT SELECT ON public.subjects TO anon;
GRANT SELECT ON public.chapters TO anon;
GRANT SELECT ON public.lectures TO anon;
GRANT SELECT ON public.tests TO anon;
GRANT SELECT ON public.homepage_banners TO anon;

CREATE POLICY "Guests view batches" ON public.batches
FOR SELECT TO anon USING (true);

CREATE POLICY "Guests view free batch subjects" ON public.subjects
FOR SELECT TO anon USING (
  EXISTS (
    SELECT 1 FROM public.batches b
    WHERE b.id = subjects.batch_id
      AND COALESCE(b.discount_price, b.price, 0) = 0
  )
);

CREATE POLICY "Guests view free batch chapters" ON public.chapters
FOR SELECT TO anon USING (
  EXISTS (
    SELECT 1 FROM public.subjects s
    JOIN public.batches b ON b.id = s.batch_id
    WHERE s.id = chapters.subject_id
      AND COALESCE(b.discount_price, b.price, 0) = 0
  )
);

CREATE POLICY "Guests view free lectures" ON public.lectures
FOR SELECT TO anon USING (is_free = true);

CREATE POLICY "Guests view public published tests" ON public.tests
FOR SELECT TO anon USING (is_published AND batch_id IS NULL);
