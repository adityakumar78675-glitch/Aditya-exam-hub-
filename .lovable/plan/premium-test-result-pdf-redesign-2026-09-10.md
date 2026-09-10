# Premium Test Result PDF Redesign

Redesign only the existing PDF export. Test scoring, submitted answers, result calculations, and the three download choices remain unchanged.

## What will change

- Replace screenshot-based page capture with a native A4 PDF layout so normal text is selectable, colors cannot trigger the `lab/oklch` error, and large exports use less memory.
- Add a branded report opening with Aditya Exam Hub, tagline, report type, test/student/attempt details, and a clear performance summary.
- Add compact repeating page headers and footers with the test name, motivational line, and accurate `Page X of Y` numbering.
- Render each question as a printer-friendly status card:
  - soft green for correct
  - soft red for wrong
  - neutral blue-grey for unattempted
  - distinct student-answer and correct-answer labels on options
  - shaded explanation section
- Keep complete question sections together where they fit; move them to a new page before splitting, and split only unusually long content safely.
- Preserve the current English/Hindi selection, formula rendering, question images, progress feedback, filenames, and automatic download behavior.
- Add the chapter field when available; otherwise show a neutral fallback without changing stored test data.

## Technical details

- Use `jsPDF` directly with RGB values and drawing primitives; remove the `html2canvas` capture path from result PDF generation.
- Embed a Unicode font for Hindi and Latin selectable text. Render KaTeX formula fragments as high-resolution transparent images only where necessary, keeping surrounding text selectable.
- Process questions incrementally and yield between batches so 100–200+ question exports remain responsive.
- Use a Blob download with a temporary object URL for reliable Android, iOS, and desktop downloads.
- Keep the existing result payload authoritative for question order, permuted options, student answers, correct answers, statuses, explanations, and marks.

## Verification

- Check build output and the existing result page.
- Generate and inspect representative All, Correct, and Wrong PDF files.
- Validate correct/wrong/unattempted highlighting, page breaks, page totals, filenames, English, Hindi, formulas, and a large synthetic 100-question export.
- Confirm generated files are valid PDFs with nonblank pages and selectable text.
