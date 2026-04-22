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
brew install node yarn ffmpeg exiftool
```

On Linux or Windows, install the same tools with your package manager.

**Clone and run:**

```bash
git clone https://github.com/ActivistChecklist/ActivistChecklist.git
cd ActivistChecklist
yarn install
cp .env.template .env   # defaults are fine for basic editing
yarn dev
```

- Site: [http://localhost:3000](http://localhost:3000)
- Fastify API (contact, stats, newsletter): port `4321` by default, routes under `/api-server/`. The site runs fine without it.

**Keystatic CMS:** Uses local filesystem storage by default (no OAuth required). Optional GitHub-backed storage and preview config is documented in `.env.template`.

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
