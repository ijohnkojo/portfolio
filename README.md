# portfolio

The source of [ijohnkojo.dev](https://ijohnkojo.dev): a portfolio site built
from the files in `content/`, plus a web OS that lives here as a separate
project.

| Path | What |
|---|---|
| `content/` | the writeups — projects, papers, presentations — and loose files under `home/`. The source of truth |
| `app/(site)/` | the site's routes: home, `/about`, a listing and a detail page per collection |
| `lib/` | the content pipeline and the site's logic, plain TypeScript |
| `components/` | the site's React components |
| `os/` | the web OS, served at `/os` — frozen since 2026-09-27 |
| `docs/` | design, architecture, decisions, authoring guide; `docs/os/` for the OS |

## Run it

```bash
pnpm install
```

```bash
pnpm dev
```

Then open http://localhost:3000.

## Check it

```bash
pnpm test
```

```bash
pnpm lint
```

```bash
pnpm build
```

Browser checks, and how to run them, are in [docs/running.md](docs/running.md).

## Read next

[docs/README.md](docs/README.md) maps the documentation. To add a writeup, see
[docs/authoring.md](docs/authoring.md).

Built with Next.js 16, React 19, TypeScript and Tailwind CSS.
