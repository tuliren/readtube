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

- **Vercel** — hosts the Next.js app, runs scheduled cron jobs, and routes LLM and embedding calls through the AI Gateway.
- **Postgres** — application database (with `pgvector` for semantic search). Any managed Postgres works.
- **[Transcript API](https://transcript-api.com)** — pulls captions from YouTube and Bilibili.
- **[JustOneAPI](https://justoneapi.com)** — fetches channel and video metadata from YouTube.

Bring your own API keys for each, set them as Vercel environment variables, and connect the Postgres URL. See [DEVELOPMENT.md](./DEVELOPMENT.md) for the full env reference.

## License

ReadTube is licensed under the [Elastic License 2.0 (ELv2)](./LICENSE.md).
