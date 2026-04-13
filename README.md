<div align="center">

[![Activist Checklist](public/images/logo-bg-white.png)](https://activistchecklist.org/)

**Practical digital security guides for activists and organizers.**

[![Last commit to main](https://img.shields.io/github/last-commit/ActivistChecklist/ActivistChecklist/main?label=last%20commit)](https://github.com/ActivistChecklist/ActivistChecklist/commits/main)
[![PR checks](https://github.com/ActivistChecklist/ActivistChecklist/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/ActivistChecklist/ActivistChecklist/actions/workflows/pr-checks.yml)
[![Deploy](https://github.com/ActivistChecklist/ActivistChecklist/actions/workflows/deploy-webhook.yml/badge.svg)](https://github.com/ActivistChecklist/ActivistChecklist/actions/workflows/deploy-webhook.yml)
[![Healthchecks](https://healthchecks.io/badge/48683141-3e2b-4da2-a269-5d8293/cxb5iwnK-2.svg)](https://healthchecks.io/)
[![Crowdin](https://badges.crowdin.net/activistchecklist/localized.svg)](https://crowdin.com/project/activistchecklist)
[![Node](https://img.shields.io/badge/node-%3E%3D22%20%3C23-339933?logo=node.js&logoColor=white)](https://github.com/ActivistChecklist/ActivistChecklist/blob/main/package.json)
[![Bluesky](https://img.shields.io/bluesky/followers/activistchecklist.org)](https://bsky.app/profile/activistchecklist.org)

[Visit the site](#visit-the-site) • [Edit content](#edit-content) • [Internationalization & translation](#internationalization--translation) • [Contact](#contact) • [Local development](#local-development) • [Repository layout](#repository-layout) • [License](#license)

</div>

---

## Visit the site

You can view the live site here: **[ActivistChecklist.org →](https://activistchecklist.org)**

## Suggest content changes

You don't need to be a coder to suggest edits to this site. The site has a **visual editor** so you can propose changes. All you need is a GitHub account.

Instructions: [How to suggestion content changes on Activist Checklist](https://activistchecklist.org/contribute/) using our visual editor

You can also make content edits directly in the `.mdx` files and submit a pull request, if you're comfortable with using git.

## Internationalization & translation

| Language | Translated | Human-reviewed |
|----------|------------|---------------|
| Spanish  | ![Spanish translation status](https://img.shields.io/badge/dynamic/json?color=blue&label=translated&style=flat&query=%24.progress.0.data.translationProgress&url=https%3A%2F%2Fbadges.awesome-crowdin.com%2Fstats-17633866-883364.json) | ![Spanish approved translation status](https://img.shields.io/badge/dynamic/json?color=brightgreen&label=human-reviewed&style=flat&query=%24.progress.0.data.approvalProgress&url=https%3A%2F%2Fbadges.awesome-crowdin.com%2Fstats-17633866-883364.json) |

Anyone can help with translations by visiting [our Crowdin project page](https://crowdin.com/project/activistchecklist). Create an account (you can use an anonymous email if you want) to review, edit, and approve translations. We’re starting with Spanish.

All english copy edits should be in the repo (in `content/en/*` and `messages/en.json`). All translation edits should be made on Crowdin.

## Contact

- **[GitHub Issues](https://github.com/ActivistChecklist/ActivistChecklist/issues):** bugs, ideas, and public discussion about the project.
- **[Contact](https://activistchecklist.org/contact/):** reach the maintainers directly when GitHub isn’t the right channel.
- **Security:** Please do not open public issues for unfixed vulnerabilities. Report them privately through [our contact page](https://activistchecklist.org/contact/) (encrypted email and Signal is available).

## Local development

### Stack

[Next.js](https://nextjs.org/) (App Router), content lives in **MDX** files under `content/en/`, [Keystatic](https://keystatic.com/) for the visual editor, Tailwind CSS, next-intl for locales, and a small [Fastify](https://fastify.dev/) API (contact form, stats, newsletter) alongside Next’s own API routes.

**Prerequisites (macOS):**  
Install [Homebrew](https://brew.sh) if you do not have it, then:

```bash
brew install node yarn ffmpeg exiftool
```

That gives you Node and Yarn for this project, plus **ffmpeg** and **exiftool** for image/video metadata scrubbing (e.g. `yarn metadata scrub`). On Linux or Windows, install the same tools with your package manager or each tool’s official packages.

**Clone the repository:**

```bash
git clone https://github.com/ActivistChecklist/ActivistChecklist.git
cd ActivistChecklist
yarn install
cp .env.template .env   # defaults are fine for basic editing
yarn dev
```

**Keystatic CMS:** Editing uses **local filesystem** storage by default (no GitHub OAuth required). To use **GitHub-backed** storage, OAuth app values, or preview flows, set the optional variables documented in **`.env.template`**.

- **Site:** You can view the site at [http://localhost:3000](http://localhost:3000)
- **Fastify API (contact, stats, newsletter):** port `4321` by default (`API_PORT`), routes under `/api-server/` — The site runs fine without this API

## Repository layout

```text
ActivistChecklist.org
├── app/           Next.js App Router (pages, API routes, Keystatic)
├── api/           Fastify server (/api-server/ — separate from the Next.js app)
├── components/    React UI
├── config/        Navigation, icons, site config
├── content/       MDX source (English under content/en/, etc.)
├── hooks/         React hooks
├── i18n/          Internationalization (routing, request config)
├── lib/           Shared libraries
├── messages/      UI strings per locale (e.g. en.json, es.json)
├── public/        Static assets
├── scripts/       Build, deploy, and tooling
├── styles/        CSS
└── utils/         Helpers
```

## License

- **Code:** [GNU General Public License v3.0](LICENSE-CODE)
- **Content and non-code assets:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

Anyone is free to use, share, and adapt the site's content and guides as long as they give appropriate credit and distribute any adaptations under the same [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license.
