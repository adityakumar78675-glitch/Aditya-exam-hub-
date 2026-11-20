# Architecture
- PowerPoint exports use a dedicated admin-authenticated server read that projects question text and four options only; answer fields never enter the export workflow.
- Generate PowerPoint files in the browser from that authorized payload using a shared layout model and editable PptxGenJS shapes/text; this avoids Worker-only package incompatibilities and keeps preview/export consistent.
- Prebundle PptxGenJS but exclude its optional npm https dependency from Vite optimization; that package otherwise shadows Node HTTPS in unrelated server dependencies.