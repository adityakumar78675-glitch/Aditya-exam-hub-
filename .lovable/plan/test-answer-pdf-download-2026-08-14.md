# Test Answer PDF Download

Add a "Download Answer PDF" option to the existing Test Result / Solutions page with three variants: Wrong answers, Correct answers, All answers. No new page, no new grading logic — it reuses exactly the data the result page already loads.

## What the student sees

1. On the result page header (next to score/language controls) a `Download PDF` button.
2. Clicking it opens a small dialog: `Wrong Answers`, `Correct Answers`, `All Answers`, each with the count of questions it will include (disabled if zero).
3. Picking one shows "Preparing your PDF..." with a progress indicator, then "PDF Ready" and the file downloads automatically.
4. Filenames: `AdityaExamHub_WrongAnswers_<TestName>.pdf`, `..._CorrectAnswers_...`, `..._AllAnswers_...` (test name sanitised for filesystem safety).

## PDF contents

Cover header on page 1: Aditya Exam Hub branding, test name, student name, subject, date, score, accuracy, total questions, attempted, correct, incorrect, unattempted.

Per question: question number with a status tag (Correct / Incorrect / Not Attempted), the question text, all options labelled A–D, "Your Answer" and "Correct Answer" lines (highlighted — green tint for correct, red tint for the student's wrong choice), then the explanation. Numerical / true-false / subjective questions show their answer values instead of options. Question images are included; if an image fails to load it is skipped with a small "image unavailable" note rather than aborting generation.

Footer on every page: "Aditya Exam Hub" left, "Page X of Y" right. Clean black-and-white layout with restrained accent colours.

## Technical approach

- Generation runs entirely in the browser from the already-fetched `getResult` payload (`solutions`, `attempt`, `test`), so no duplicate calculations and no new server surface. Security is inherited: `getResult` is auth-middleware protected and scoped to the caller's own attempt, so a student can only ever produce a PDF of their own data.
- New file `src/lib/result-pdf.ts` plus a `src/components/ResultPdfDialog.tsx`; the result route only gains the button + dialog mount. Existing submission, palette, solutions, retake and history code paths are untouched.
- Rendering: build an off-screen, print-styled HTML document that reuses the same markdown/KaTeX pipeline as `RichMarkdown`, then rasterise it page-by-page into a PDF. This is what makes LaTeX render as real notation (`x²`, proper fractions) and chemical formulas as `H₂O`, `H₂SO₄` instead of raw `$...$` source, and it keeps Hindi (Devanagari) text correct — a plain text-drawing PDF library cannot do either.
- New dependencies: `jspdf` and `html2canvas` (both browser-only, imported lazily inside the click handler so they never enter the initial bundle or SSR).
- Student name comes from the existing profile/auth context already available on the page; if absent, falls back to the account email.
- Images are inlined as data URLs before rasterising, with a per-image timeout so one bad URL cannot hang generation.
