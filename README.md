# ReadTube

Turn YouTube subscriptions into a personal newsletter. Reclaim focus in a world engineered for distraction.

Live at [read.tube](https://read.tube).

## What it does

ReadTube converts the YouTube channels you follow into readable, searchable articles so you can consume videos without being pulled into the feed.

- **Subscribe to channels.** Point ReadTube at the YouTube channels you care about. New videos show up in your inbox, not in an autoplay queue.
- **Read instead of watch.** Each video is transcribed and turned into a clean, readable page — with the original video embedded for when you want it.
- **Search across everything.** Full-text search over transcripts lets you find the moment you remember without scrubbing a timeline.
- **Annotate and save.** Highlight passages and come back to them later; your subscriptions become a personal knowledge base instead of a feed.
- **Skim, don't doomscroll.** An inbox-style layout puts you in control of what you open and when.

## Why

YouTube is a great source of ideas and a terrible place to think. Long videos bury the substance; the homepage is optimized for the next click, not for you. ReadTube strips the video feed down to the parts you actually subscribed for and hands them back in a format built for reading.

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for local development.

## Deployment

ReadTube self-hosts on the following stack:

- **Vercel**: Hosts the Next.js app, runs scheduled cron jobs, and routes LLM and embedding calls through the AI Gateway.
- **Postgres**: Application database (with `pgvector` for semantic search). Any managed Postgres works.
- **[Clerk](https://clerk.com/)**: Authentication and user management.
- **[Transcript API](https://transcriptapi.com/)**: Transcript vendor for YouTube.
- **[JustOneAPI](https://justoneapi.com)**: Channel metadata and transcript vendor for Bilibili.

### Deploy on Vercel

1. Fork the repo and import it as a new Vercel project. Set the root directory to `apps/web` — Vercel will detect Next.js automatically.
2. Provision a Postgres database (with `pgvector` enabled) and run the migrations: `yarn db:deploy` against the production `DATABASE_URL`.
3. Add the environment variables from [DEVELOPMENT.md](./DEVELOPMENT.md#environment-variables) to the Vercel project (Postgres URL, Clerk keys, Transcript API key, JustOneAPI token, AI Gateway key, `CRON_SECRET`).
4. Enable the Vercel AI Gateway on the project so LLM and embedding calls route through it.
5. Deploy. The cron in `apps/web/vercel.json` (`/api/cron/refresh-channels`, every 30 min) is registered automatically. It's gated by `CRON_SECRET` — generate any random string (e.g. `openssl rand -hex 32`) and set the same value in Vercel.

## License

ReadTube is licensed under the [Elastic License 2.0 (ELv2)](./LICENSE.md).
