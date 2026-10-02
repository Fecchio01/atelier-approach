# ESLint generated output fix

- Added `.vercel/**` to the global ESLint ignores in `eslint.config.mjs`.
- Ran `npm run lint` after the change. The original `.vercel/output` diagnostics were excluded, but lint still exits 1 with 1,070 errors in `public/pdfjs/pdf.min.mjs`.
- No application code or other configuration was changed. The pre-existing `next-env.d.ts` modification was left untouched.
