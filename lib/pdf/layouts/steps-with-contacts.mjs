/**
 * Two-column poster: a big title, fill-in boxes for phone numbers on the left,
 * numbered steps on the right. First used for "Police at the door".
 *
 * The numbers come from the Canva original (public/files/downloads/
 * police-at-the-door-poster-activistchecklist-org-v4.pdf, removed once this
 * replaced it; see git history). Canva lays pages
 * out in CSS pixels, 816 x 1056 for US Letter, so its PDF gives every
 * baseline, box and font size in the same units this page uses. The design is
 * drawn at that size; other paper sizes scale the whole page to fit.
 *
 * Text flows instead of sitting at Canva's fixed positions, so a translation
 * can run longer. The title shrinks until it fits its box, and a column that
 * would run off the page is shrunk as a whole (see fitPoster below).
 *
 * Content shape (content/<locale>/pdf/<slug>.json):
 *   title, intro, moreInfo                     text
 *   fillIn.<group>.heading                     text above a grey box
 *   fillIn.<group>.fields.<key>                one label and blank line per key
 *   steps.<step>.heading                       text in a black pill
 *   steps.<step>.intro                         a sentence
 *   steps.<step>.bullets | numbered | phrases  one list item per key
 * A step can mix intro and lists, in any order; they render in key order.
 */

import { escapeHtml, renderInline } from '../content.mjs';

export const fonts = [
  { family: 'Bebas Neue', pkg: '@fontsource/bebas-neue', weights: [400] },
  { family: 'Open Sans', pkg: '@fontsource/open-sans', weights: [300, 400, 700] },
  // The 2014 League Spartan, not today's: Canva still uses it, and the current
  // release is 10-20% narrower letter by letter. The file in lib/pdf/fonts is
  // the unmodified TrueType build from github.com/theleagueof/league-spartan,
  // tag 1.000 (SIL OFL, license alongside it).
  { family: 'League Spartan 2014', file: 'LeagueSpartan-Bold.ttf', weight: 700 },
];

/** The size the design is drawn at, in CSS px. */
export const DESIGN_SIZE = { width: 816, height: 1056 };

const TITLE = {
  maxSize: 133.33,
  minSize: 40,
  // The title shrinks until its last baseline is at most this far below the
  // top of its box. English sits at 322.5 with three lines at full size;
  // Spanish needs four lines and lands about where Canva put it by hand.
  maxBaseline: 333,
};

/** Columns must end above this line, or they are shrunk to fit. */
const COLUMN_LIMIT = 1040;

// Chromium puts every text baseline on a whole pixel. Laying the page out
// this many times larger and scaling it back down, as Canva does, lets text
// land within a fraction of a pixel of the design instead.
const SUPERSAMPLE = 4;

const STYLE = `
@page { margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  --fallback-font: sans-serif;
  --fallback-display-font: var(--fallback-font);
}
/* Break Japanese between phrases rather than anywhere in a word. */
:lang(ja) { word-break: auto-phrase; }
h1, h2, p, ul, ol { margin: 0; padding: 0; font-size: inherit; font-weight: inherit; }
ul, ol { list-style: none; }
a { color: inherit; }

.sheet { overflow: hidden; }
.scaler { transform-origin: 0 0; transform: scale(${1 / SUPERSAMPLE}); }
.page {
  position: relative;
  width: ${DESIGN_SIZE.width}px;
  height: ${DESIGN_SIZE.height}px;
  overflow: hidden;
  zoom: ${SUPERSAMPLE};
}

/* ── Left column ─────────────────────────────────────────── */

.left {
  position: absolute;
  left: 23.909px;
  top: 27.17px;
  width: 280px;
}
.title {
  height: 341.754px;
  font-family: 'Bebas Neue', var(--fallback-display-font);
  font-size: ${TITLE.maxSize}px;
  line-height: 0.8475;
  text-transform: uppercase;
}
.title-end { display: inline-block; width: 0; height: 0; }
.intro {
  font: 300 16px/22px 'Open Sans', var(--fallback-font);
}
.fill-heading {
  margin-top: 20.83px;
  padding-left: 10.784px;
  font: 400 24px/24px 'Bebas Neue', var(--fallback-display-font);
  text-transform: uppercase;
}
.fill-in + .fill-in .fill-heading { margin-top: 20.02px; }
.box {
  width: 244.79px;
  margin-top: 6.5px;
  padding: 12.67px 12.147px 14.08px 10.678px;
  background: rgb(206 206 207);
  border-radius: 13px;
}
.field + .field { margin-top: 9.4px; }
.field-label {
  padding-left: 0.83px;
  font: 700 16px/22px 'Open Sans', var(--fallback-font);
}
.field-blank {
  height: 34.754px;
  margin-top: 1px;
  background: #fff;
}
.more-info {
  margin-top: 14.9px;
  padding-left: 4.627px;
  font: 700 16px/22px 'Open Sans', var(--fallback-font);
}
.more-info a {
  display: block;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 1px;
}

/* ── Right column ────────────────────────────────────────── */

.right {
  position: absolute;
  left: 323.588px;
  top: 30.29px;
  width: 457.4px;
  font: 400 18.66px/26px 'Open Sans', var(--fallback-font);
}
.step + .step { margin-top: 27.23px; }
.pill {
  width: fit-content;
  max-width: calc(100% + 21.584px);
  margin-left: -10.667px;
  padding: 0 10.917px 1.664px 10.667px;
  border-radius: 10.917px;
  background: #000;
  color: #fff;
  font: 700 26.66px/42.003px 'League Spartan 2014', 'Open Sans', var(--fallback-font);
}
.pill + * { margin-top: 9.86px; }
.pill + .step-intro { margin-top: 10.05px; }
strong { font-weight: 700; }

.bullets li, .numbered li { position: relative; padding-left: 31.719px; }
.bullets li::before {
  content: '';
  position: absolute;
  left: 13px;
  top: 11.5px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.numbered { counter-reset: step; }
.numbered li { counter-increment: step; }
.numbered li::before {
  content: counter(step) '.';
  position: absolute;
  left: 14.281px;
}

.step-intro + .phrases { margin-top: 11.39px; }
.phrases {
  font: 400 26.663px/36.556px 'Bebas Neue', var(--fallback-display-font);
  text-transform: uppercase;
}
.phrases li { padding-left: 30.78px; }
.arrow {
  width: 1em;
  height: 0.7em;
  margin-left: -30.78px;
  margin-right: 4.117px;
  vertical-align: baseline;
  fill: currentColor;
}
.step:has(.phrases:last-child) + .step { margin-top: 26.54px; }
`;

// Canva drew this arrow from Noto Sans CJK, its fallback for a character
// Bebas Neue lacks. This is that glyph's outline, in font units above the
// baseline, so it renders the same wherever the PDF is built.
const ARROW = `<svg class="arrow" viewBox="0 -700 1000 700" aria-hidden="true"><path d="M40 -346L811 -346C760 -307 694 -244 649 -182L709 -147C776 -235 876 -323 965 -380C876 -437 776 -525 709 -613L649 -578C694 -516 760 -453 811 -414L40 -414Z"/></svg>`;

const LIST_TAGS = { bullets: 'ul', numbered: 'ol', phrases: 'ul' };

function renderStepPart(kind, value, where) {
  if (kind === 'intro') return `<p class="step-intro">${renderInline(value)}</p>`;
  const tag = LIST_TAGS[kind];
  if (!tag) {
    throw new Error(
      `${where}.${kind}: a step can hold heading, intro, ${Object.keys(LIST_TAGS).join(', ')}`,
    );
  }
  const arrow = kind === 'phrases' ? ARROW : '';
  const items = Object.values(value)
    .map((text) => `<li>${arrow}${renderInline(text)}</li>`)
    .join('');
  return `<${tag} class="${kind}">${items}</${tag}>`;
}

function renderStep(key, step) {
  const { heading, ...parts } = step;
  const body = Object.entries(parts)
    .map(([kind, value]) => renderStepPart(kind, value, `steps.${key}`))
    .join('');
  return `<section class="step"><h2 class="pill">${renderInline(heading)}</h2>${body}</section>`;
}

function renderFillIn(group) {
  const fields = Object.values(group.fields)
    .map(
      (label) =>
        `<div class="field"><div class="field-label">${renderInline(label)}</div><div class="field-blank"></div></div>`,
    )
    .join('');
  return `<section class="fill-in"><h2 class="fill-heading">${renderInline(group.heading)}</h2><div class="box">${fields}</div></section>`;
}

/**
 * Runs in the page once fonts have loaded. Returns the sizes it settled on,
 * or throws when the text cannot be made to fit, which fails the build for
 * that poster rather than printing text off the edge of the page.
 */
function fitPoster({ title: limits, columnLimit, scale }) {
  const title = document.querySelector('.title');
  const end = title.querySelector('.title-end');
  const titleFits = (px) => {
    title.style.fontSize = `${px}px`;
    const baseline = end.getBoundingClientRect().bottom - title.getBoundingClientRect().top;
    return title.scrollWidth <= title.clientWidth + 0.5 && baseline <= limits.maxBaseline + 0.01;
  };
  let titleSize = limits.maxSize;
  if (!titleFits(titleSize)) {
    let lo = limits.minSize;
    let hi = limits.maxSize;
    if (!titleFits(lo)) throw new Error(`the title does not fit even at ${lo}px`);
    while (hi - lo > 0.01) {
      const mid = (lo + hi) / 2;
      if (titleFits(mid)) lo = mid;
      else hi = mid;
    }
    titleSize = Math.floor(lo * 100) / 100;
    titleFits(titleSize);
  }

  // A column that runs past the limit is zoomed out as a whole, keeping its
  // width on the page, so every gap and font size shrinks together.
  const zooms = {};
  for (const column of document.querySelectorAll('.left, .right')) {
    // zoom scales the column's own left, top and width too, so divide them
    // back out to keep it in the same place on the page.
    const width = column.getBoundingClientRect().width;
    const { left, top } = getComputedStyle(column);
    const fitsAt = (zoom) => {
      column.style.zoom = String(zoom);
      column.style.width = `${width / zoom}px`;
      column.style.left = `${parseFloat(left) / zoom}px`;
      column.style.top = `${parseFloat(top) / zoom}px`;
      return column.getBoundingClientRect().bottom <= columnLimit;
    };
    let zoom = 1;
    if (!fitsAt(1)) {
      let lo = 0.7;
      let hi = 1;
      if (!fitsAt(lo)) throw new Error(`.${column.className} runs off the page even at 70%`);
      while (hi - lo > 0.002) {
        const mid = (lo + hi) / 2;
        if (fitsAt(mid)) lo = mid;
        else hi = mid;
      }
      zoom = Math.floor(lo * 1000) / 1000;
      fitsAt(zoom);
    }
    if (zoom === 1) {
      column.style.removeProperty('zoom');
      column.style.removeProperty('width');
      column.style.removeProperty('left');
      column.style.removeProperty('top');
    }
    zooms[column.className] = zoom;
  }

  document.querySelector('.scaler').style.transform =
    `translate(${scale.x}px, ${scale.y}px) scale(${scale.factor / scale.supersample})`;
  return { titleSize, zooms };
}

/**
 * @param content     localized poster text (see the shape above)
 * @param config      this PDF's entry in config/pdfs.mjs
 * @param lang        BCP 47 language for the page and the tagged PDF
 * @param href        full URL the printed address links to
 * @param paper       { width, height } of the sheet in CSS px
 * @param fontCss     @font-face rules for `fonts`, plus any locale fallback
 * @param fallbackFont CSS family list tried after the layout's own fonts
 * @param fallbackDisplayFont the same, for text set in the display face
 */
export function renderPosterHtml({
  content,
  config,
  lang,
  href,
  paper,
  fontCss,
  fallbackFont,
  fallbackDisplayFont,
}) {
  const factor = Math.min(paper.width / DESIGN_SIZE.width, paper.height / DESIGN_SIZE.height);
  const scale = {
    factor,
    x: (paper.width - DESIGN_SIZE.width * factor) / 2,
    y: (paper.height - DESIGN_SIZE.height * factor) / 2,
    supersample: SUPERSAMPLE,
  };
  const fitArgs = { title: TITLE, columnLimit: COLUMN_LIMIT, scale };

  const fillIns = Object.values(content.fillIn).map(renderFillIn).join('');
  const steps = Object.entries(content.steps)
    .map(([key, step]) => renderStep(key, step))
    .join('');

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(content.title)}</title>
<style>
${fontCss}
@page { size: ${paper.width}px ${paper.height}px; }
${STYLE}
${fallbackFont ? `body { --fallback-font: ${fallbackFont}, sans-serif; }` : ''}
${fallbackDisplayFont ? `body { --fallback-display-font: ${fallbackDisplayFont}, sans-serif; }` : ''}
</style>
</head>
<body>
<div class="sheet" style="width: ${paper.width}px; height: ${paper.height}px">
<div class="scaler">
<div class="page">
<div class="left">
<h1 class="title">${renderInline(content.title)}<span class="title-end"></span></h1>
<p class="intro">${renderInline(content.intro)}</p>
${fillIns}
<p class="more-info">${renderInline(content.moreInfo)}<a href="${escapeHtml(href)}">${escapeHtml(config.printedUrl)}</a></p>
</div>
<div class="right">${steps}</div>
</div>
</div>
</div>
<script>
window.fitPoster = () => (${fitPoster.toString()})(${JSON.stringify(fitArgs)});
</script>
</body>
</html>
`;
}
