# Show HN draft

Adapted from the Product Hunt maker comment (`apps/web/src/app/producthunt/_lib/copy.ts`,
`PH_FIRST_COMMENT`) on Sep 4, 2026. Owner submits; nothing here is published automatically.

## What changed from the Product Hunt comment, and why

- **Stale facts fixed.** The PH comment says a video without native captions "won't work";
  the Gemini transcript-generation pipeline for caption-less videos has shipped since. It
  also lists "chatting with videos" as a future plan; the ask-my-inbox chat exists now.
  HN readers test claims, so the draft below only states what is live.
- **HN register.** Dropped the "Hi Product Hunt 👋" opener, the emoji, and the
  "Scroll less. Read more." sign-off. HN rewards plain first-person explanation, technical
  detail, and honest limitations, and punishes taglines.
- **More "how it works".** The transcription pipeline (URL ingestion in 20-minute windows,
  the ~1 h ingestion cliff, per-video-hour cost) and the map-reduce article path with
  embedding-based section cuts are the kind of detail that carries a Show HN thread.
- **Sign-up wall softened.** HN dislikes tools that require an account to see anything.
  Link a public reader page (`/p/videos/<id>`) so readers can see the output first. Pick
  one at submission time; do not commit a specific video id here.
- **The Claude Code angle stays**, phrased factually. It will draw comments either way;
  owning it up front reads better than having it discovered.

## Title

`Show HN: ReadTube – Read your YouTube subscriptions as articles instead of watching`

(HN prefers a plain description after the name, no marketing adjectives; 80-char limit.)

## URL

`https://read.tube`

## First comment (post as the maker, right after submitting)

Hi HN, I'm Liren. ReadTube turns the YouTube channels you subscribe to into an inbox of
readable posts. Every new video gets a short summary, a long summary, and a full-length
article, and you triage them like email: star, save for later, archive, mark unread.

Why: YouTube has a lot of high-quality long-form content (physics lecture series, two-hour
interviews) that I wanted to keep up with but never had time to watch. Paste-a-URL
summarizers exist, but they are one-off. I wanted the "follow" part, so the app polls the
channels and the reading queue fills itself. Now I skim the summary and decide whether the
article, the video, or neither is worth my time.

How it works:

- Channel and video metadata come from the YouTube Data API v3. Transcripts come from
  TranscriptAPI, because captions are owner-OAuth-only on the official API. Bilibili
  channels are supported through JustOneAPI.
- Videos with no caption track can be transcribed on demand with Gemini. The server hands
  Gemini the watch URL in 20-minute windows, transcribes them in parallel, and stitches
  the result. It costs about $0.30 per video-hour, so it is an explicit button rather
  than automatic. URL ingestion silently returns zero video tokens past roughly an hour,
  which is why the windowing exists at all.
- Summaries and articles are generated with GPT. Long transcripts go through a map-reduce
  path: the transcript is split into sections at embedding-detected topic shifts, sections
  are written in parallel, and a reduce pass consolidates the outline. Articles can be
  generated in your own language.
- Full-text search over everything you have read, notes and highlights, folders, playlist
  import, and a chat over your inbox.
- Stack: Next.js on Vercel, Postgres on Neon with Prisma, Clerk for auth.

Source-available under the Elastic License 2.0 (self-hosting is fine; the restriction is
offering it as a hosted service to others): https://github.com/tuliren/readtube. Free
during the beta.

One note on process: this is my first project built almost entirely with Claude Code. I set
up the infrastructure and acted as the product manager and reviewer. Happy to talk about
what that was like, good and bad.

Sign-up is needed for the inbox, but public reader pages show what the output looks like:
<link one public /p/videos page here>.

Feedback welcome, especially on the reading experience and on what would make you use this
over watching at 2x.

## Submission notes

- Post Tuesday to Thursday, 8–10am US Eastern. Stay in the thread for the first three
  hours; Show HN threads live or die on maker replies.
- Expected questions and short answers:
  - *Why ELv2 and not open source?* Keeps self-hosting and forks legal while stopping a
    hosted clone; say so plainly.
  - *Why not yt-dlp + Whisper locally?* Gemini URL ingestion needs no audio download and
    runs on Vercel; a local pipeline is a fine alternative for self-hosters.
  - *Isn't this just a summarizer?* The unit is the subscription, not the URL; the inbox
    and triage are the product.
  - *What happens to my data / do you train on it?* The privacy page currently says
    nothing about AI providers or training. Decide the answer before posting (transcripts
    are sent to the OpenAI and Google APIs for generation; ReadTube itself trains
    nothing) and add a line to the privacy page so the thread answer has a source.
  - *Pricing?* Free during beta; paid tiers listed on the site are not purchasable yet.
- Tag the site link with UTMs only if HN's link is not the bare homepage; HN strips
  nothing, but a bare `https://read.tube` reads better and the referrer
  (`news.ycombinator.com`) is captured by attribution anyway.
