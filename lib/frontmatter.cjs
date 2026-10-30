/**
 * The only place that may import gray-matter (enforced by __tests__/frontmatter.test.js).
 *
 * gray-matter picks a parser from the text after the opening delimiter, and its built-in
 * `---js` / `---javascript` parser runs the front matter through eval(). Draft preview parses
 * MDX fetched from GitHub branches and forks, so a default `matter(raw)` call there is remote
 * code execution. The code-running engines are replaced with ones that throw, and since our
 * content only uses YAML, any other language gray-matter picked is rejected after parsing.
 *
 * CommonJS so the .cjs build scripts can require it; ESM code imports it by name.
 */
const matter = require('gray-matter');

const YAML_LANGUAGES = new Set(['yaml', 'yml']);

function refuse(name) {
  return () => {
    throw new Error(`Front matter language "${name}" is not allowed (use YAML)`);
  };
}

const ENGINE_OVERRIDES = {
  js: refuse('js'),
  javascript: refuse('javascript'),
  coffee: refuse('coffee'),
  coffeescript: refuse('coffeescript'),
  cson: refuse('cson'),
};

/**
 * Parse YAML front matter. Throws if the opening delimiter names any other language.
 * Passing options also keeps gray-matter from caching every parsed string in memory.
 *
 * @param {string} raw - full file text
 * @returns {{ data: Record<string, any>, content: string }}
 */
function parseFrontmatter(raw) {
  const file = matter(raw, { engines: ENGINE_OVERRIDES });
  // `language` is whatever gray-matter actually used ('yaml' when the delimiter names none;
  // unset for empty input, which never reaches an engine).
  const language = file.language || 'yaml';
  if (!YAML_LANGUAGES.has(String(language).trim().toLowerCase())) {
    throw new Error(`Front matter language "${file.language}" is not allowed (use YAML)`);
  }
  return { data: file.data, content: file.content };
}

/**
 * Serialize `data` as YAML front matter above `content`. Passes a file object, not a string,
 * so gray-matter never parses `content` (a string would go through its default engines).
 *
 * @param {string} content
 * @param {Record<string, any>} data
 * @returns {string}
 */
function stringifyFrontmatter(content, data) {
  return matter.stringify({ content, data: {} }, data);
}

module.exports = { parseFrontmatter, stringifyFrontmatter };
