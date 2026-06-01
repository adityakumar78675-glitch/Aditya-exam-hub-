# Plan: Secure Batch Access + Fix Open Button

## Problem

1. **Open button doesn't navigate** for enrolled students on mobile (543px viewport).
2. **Data leakage**: `batches` and `lectures` RLS policies use `USING (true)` for any authenticated user — any signed-in student can read every batch/lecture row even without enrolling. Frontend "lock" UI is cosmetic; backend returns everything.

## Fix 1 — Backend (RLS, the real security gate)

New migration tightening policies. Keep admin + enrolled-user reads; remove public reads.

**`batches`** — replace `Anyone authenticated views batches` with:
- Admins: full read
- Anyone authenticated: read only `id, title, description, thumbnail_url, class_level, subjects, price, discount_price, mentors, enrollment_open, created_at` (catalog browsing stays possible — needed for `/batches` listing and Buy Now page)
- Since RLS is row-level not column-level, keep SELECT open on the row but rely on the fact that batches table has no premium content — premium content lives in `lectures`/`materials`. So actually: keep batches readable (catalog), tighten lectures/materials instead.

**`lectures`** — replace `Auth views lectures` with:
```
USING (
  has_role(auth.uid(),'admin')
  OR is_free = true
  OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = lectures.batch_id)
  OR EXISTS (SELECT 1 FROM batches b WHERE b.id = lectures.batch_id AND COALESCE(b.discount_price, b.price, 0) = 0)
)
```

**`materials`** — same pattern, joining through `lectures` → `batches`/`enrollments`.

**`lecture_progress`** — already user-scoped, no change.

This makes backend the source of truth: non-enrolled students literally cannot fetch lecture rows.

## Fix 2 — Frontend Open button

Root cause of "Open does nothing": the enrolled `<Link to="/batches/$batchId">` works, but the route then renders. If the user reports it doing nothing, likely the destination page is loading but appearing blank because the lectures query returns `[]` due to RLS — or the click is being swallowed.

Changes in `src/routes/_authenticated/batches.tsx`:
- Replace `<Link>` with `useNavigate()` + `<button onClick>` for View/Open so mobile taps reliably fire and we can log `[Open] navigating to`.
- Keep existing enrollment check.

## Fix 3 — Batch detail page (`batches.$batchId.tsx`)

- Already gates UI with `hasAccess`. Keep as-is, but now lectures list will be empty for non-enrolled users (RLS), which is correct.
- Ensure "Buy Now / Enroll" CTA is prominent when `!hasAccess`.
- Add explicit "Please purchase this batch to continue" message in the lectures section when `!hasAccess && !isAdmin`.

## Fix 4 — Lecture page (`lectures.$lectureId.tsx`)

- Already checks `hasAccess`. With new RLS, the lecture query itself returns null for unauthorized users → shows "Lecture not found". Update to redirect to the batch's purchase page instead when lecture is null but user is authenticated (best-effort: we can't know batch id if row is null, so fall back to `/batches`).

## Files touched

- New migration: tighten `lectures` + `materials` SELECT policies
- `src/routes/_authenticated/batches.tsx` — switch View/Open to `useNavigate` with debug logs
- `src/routes/_authenticated/batches.$batchId.tsx` — add explicit purchase-required message block
- `src/routes/_authenticated/lectures.$lectureId.tsx` — graceful fallback when RLS hides the row

## Out of scope

- Subjects/chapters tables don't exist in current schema (only batches → lectures → materials). No changes needed there.
- Payment processing — "Enroll" currently inserts directly into `enrollments`. Real payment integration is a separate request.
