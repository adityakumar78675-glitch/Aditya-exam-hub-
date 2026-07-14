ALTER TABLE public.extra_notes
  ADD CONSTRAINT extra_notes_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE,
  ADD CONSTRAINT extra_notes_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD CONSTRAINT extra_notes_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';