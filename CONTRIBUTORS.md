# Contributing

We are a small, all-volunteer open-source project. Step-by-step documentation for writing, editing, translating, and coding lives in the [Activist Checklist Contributor Guide](https://docs.activistchecklist.org/).

- **Getting oriented:** [Get started](https://docs.activistchecklist.org/getting-started/) with contributing to this project.
- **Editing and writing:** [Start writing or editing](https://docs.activistchecklist.org/writing/start-writing/) guides. Covers the visual editor, style guide, and writing from scratch. [Guide ideas and priorities](https://github.com/ActivistChecklist/ActivistChecklist/wiki/Guide-proposals) are on the wiki.
- **Translating:** [Start translating](https://docs.activistchecklist.org/translating/start-translating/). Translations are automatic; we need human reviewers on [Crowdin](https://crowdin.com/project/activistchecklist). English copy edits belong in the repo; translation edits belong on Crowdin.
- **Coding:** [Start coding](https://docs.activistchecklist.org/coding/start-coding/). Browse open [GitHub issues](https://github.com/ActivistChecklist/ActivistChecklist/issues) across different skill levels.
- See more ways you can contribute on our [contriubtors page](https://activistchecklist.org/contribute/)

## Local development

If you prefer to contribute anonymously, [create an anonymous GitHub account](https://docs.activistchecklist.org/reference/anonymous-github/) and read the guide on [anonymous commits](https://docs.activistchecklist.org/coding/anonymous-commits/).

### Stack

[Next.js](https://nextjs.org/) (App Router), content in MDX files under `content/en/`, [Keystatic](https://keystatic.com/) for the visual editor, Tailwind CSS, next-intl for locales, and a small [Fastify](https://fastify.dev/) API alongside Next's own API routes.

### Setup

**Prerequisites (macOS):**

```bash
brew install node ffmpeg exiftool
corepack enable   # activates the pnpm version pinned in package.json
```

On Linux or Windows, install the same tools with your package manager. `corepack` ships with Node.js 16.10+.

**Clone and run:**

```bash
git clone https://github.com/ActivistChecklist/ActivistChecklist.git
cd ActivistChecklist
pnpm install
cp .env.template .env   # defaults are fine for basic editing
pnpm dev
```

- Site: [http://localhost:3000](http://localhost:3000)
- Fastify API (contact, stats, newsletter): port `4321` by default, routes under `/api-server/`. The site runs fine without it.

**Keystatic CMS:** Uses local filesystem storage by default (no OAuth required). Optional GitHub-backed storage and preview config is documented in `.env.template`.

### Formatting

Code is formatted with [Prettier](https://prettier.io/) using the repo's `.prettierrc`. You don't have to do anything special: `pnpm install` sets up a pre-commit hook that formats the files you commit, and CI runs `pnpm format:check` on every PR. If that check fails, run `pnpm format` and commit the result.

If your editor formats on save, point it at the repo's config so it doesn't reformat whole files:

- **VS Code:** install the recommended extensions when prompted (Prettier and EditorConfig). Also **trust the workspace**. In Restricted Mode the Prettier extension ignores `.prettierrc` and formats with its own defaults, which rewrites every quote and line in the file.
- **Other editors:** use the Prettier plugin for your editor, and turn on EditorConfig support if it isn't built in.

MDX content, Markdown, and `messages/` are not run through Prettier (see `.prettierignore`).

To keep `git blame` useful across the bulk reformat commit, run this once in your clone:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## Repository layout

```
ActivistChecklist.org
├── app/           Next.js App Router (pages, API routes, Keystatic)
├── api/           Fastify server (/api-server/)
├── components/    React UI
├── config/        Navigation, icons, site config
├── content/       MDX source (content/en/, content/es/, etc.)
├── hooks/         React hooks
├── i18n/          Internationalization (routing, request config)
├── lib/           Shared libraries
├── messages/      UI strings per locale (en.json, es.json, etc.)
├── public/        Static assets
├── scripts/       Build, deploy, and tooling
└── styles/        CSS
```

## License

- **Code:** [GNU General Public License v3.0](LICENSE-CODE)
- **Content and non-code assets:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
