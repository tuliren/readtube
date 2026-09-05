# Show HN draft

Adapted from the Product Hunt maker comment (`apps/web/src/app/producthunt/_lib/copy.ts`,
`PH_FIRST_COMMENT`) on Sep 4, 2026. Owner submits; nothing here is published automatically.

## Title

`Show HN: ReadTube – Read your YouTube subscriptions as articles instead of watching`

(HN prefers a plain description after the name, no marketing adjectives; 80-char limit.)

## URL

`https://read.tube`

## First comment (post as the maker, right after submitting)

Hi HN, I'm Liren, author of ReadTube. This is an app that turns YouTube subscriptions into a personal newsletter.

YouTube has lots of high quality content. But videos can be difficult to consume efficiently, especially those that are long and about series topics (e.g. general relativity, quantum physics). So I created this app to solve this need.

There are already tons of existing YouTube AI transcription websites. However, ReadTube is one step further in that it periodically fetches the updates from the channels I subscribe to, so I don't need to paste in the video URL each time. Also, it can generate two different versions of summaries: one short and one long, as well as a full length article. I can pick which length to consume according to the type of videos.

How it works:

- Channel and video metadata come from the YouTube Data API v3. Transcripts come from TranscriptAPI. Bilibili channels are supported through JustOneAPI.
- Videos with no caption track can be transcribed on demand with Gemini.
- Summaries and articles are generated with GPT. Long transcripts go through a map-reduce approach: the transcript is processed in small chunks in parallel, and a reducer stitches the outputs together.
- Some other features: playlist import, translation, custom folders, notes, semantic search. I also plan to add chatting with videos in the future.
- Stack: Next.js on Vercel, Postgres on Neon with Prisma, Clerk for auth.

The app is source-available under the Elastic License 2.0: https://github.com/tuliren/readtube. Free
during the beta.

Personally, I really enjoy using this app. There are so many seemingly interesting but long interview videos that I would be curious about but never have the time to check out (e.g. Lex Fridman's channel). Now I can easily skim through the summary and decide whether it is worth reading or watching. Hope that it is helpful to you too.

Watch less. Read more.

## Submission notes

- Post Tuesday to Thursday, 8–10am US Eastern. Stay in the thread for the first three
  hours; Show HN threads live or die on maker replies.
- Expected questions and short answers:
  - *Why not yt-dlp + Whisper locally?* Gemini URL ingestion needs no audio download and
    runs on Vercel; a local pipeline is a fine alternative for self-hosters.
  - *Isn't this just a summarizer?* The unit is the subscription, not the URL; the inbox
    and triage are the product.
  - *What happens to my data / do you train on it?* Point at the privacy policy's
    "AI-Generated Content" and "Service Providers (Sub-processors)" sections: OpenAI and
    Google receive the transcript text (or, for caption-less videos, the public video
    URL) to produce the output you asked for, and the output is stored with your account.
    ReadTube trains nothing.
  - *Pricing?* Free during beta; paid tiers listed on the site are not purchasable yet.
- Tag the site link with UTMs only if HN's link is not the bare homepage; HN strips
  nothing, but a bare `https://read.tube` reads better and the referrer
  (`news.ycombinator.com`) is captured by attribution anyway.
