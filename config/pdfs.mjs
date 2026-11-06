/**
 * Designed PDFs, such as the "Police at the door" poster: everything about
 * each one except its words.
 *
 * The words live in content/<locale>/pdf/<slug>.json. The English file is the
 * Crowdin source and Crowdin writes the other languages. Each PDF is rendered
 * by scripts/build-designed-pdfs.mjs and offered on the site by
 * <PdfDownload slug="..."> (components/PdfDownload.jsx).
 *
 *   layout      the design, in lib/pdf/layouts/<layout>.mjs
 *   pagePath    the site page the PDF belongs to; the printed address links there
 *   printedUrl  that address as printed, short enough to type
 *   locales     languages to build and offer. Crowdin AI-translates every
 *               language as soon as the English file lands, so add one here
 *               only after someone has reviewed its translation: a printed
 *               poster can't be corrected once it is on someone's wall.
 */
export const PDFS = {
  'police-at-the-door': {
    layout: 'steps-with-contacts',
    pagePath: '/police/',
    printedUrl: 'ActivistChecklist.org/police',
    locales: ['en', 'es'],
  },
};
