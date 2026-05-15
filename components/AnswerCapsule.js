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
    <div
      className="mb-6 border-l-4 border-primary/60 bg-primary/5 dark:bg-primary/15 px-4 py-3 rounded-r-md text-base leading-relaxed print:bg-transparent print:border-l-2"
      data-testid="answer-capsule"
    >
      <p className="m-0 text-foreground">{text}</p>
    </div>
  );
}
