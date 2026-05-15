/**
 * Renders the `answerCapsule` frontmatter field at the top of a guide.
 *
 * The capsule is a 40–60 word direct answer to the page's implicit search
 * query. Sits between the page header and the body intro. AI search engines
 * (ChatGPT, Perplexity, Google AI Mode) preferentially extract answer-first
 * paragraphs near the top of the page, so this block doubles as both a
 * reader-facing TL;DR and a structured signal for crawlers.
 */
export default function AnswerCapsule({ text }) {
  if (!text || !String(text).trim()) return null;
  return (
    <aside
      className="mb-6 rounded-lg border border-border bg-muted/40 px-5 py-4 shadow-md text-base leading-relaxed text-foreground print:shadow-none print:border print:bg-transparent"
      data-testid="answer-capsule"
    >
      <p className="m-0">{text}</p>
    </aside>
  );
}
