# Transcript fetching experiments

Scripts to benchmark different ways of fetching a YouTube video's native
transcript for **free**, without:

- paying `transcriptapi.com` or another third-party transcript service;
- signing in to YouTube;
- shelling out to `yt-dlp` / `ffmpeg` (Vercel serverless can't run them).

Approaches A–D hit `www.youtube.com` directly. They therefore share the
same fundamental weakness: **YouTube aggressively rate-limits /
bot-blocks datacenter IPs**. When the request IP is flagged, YouTube
responds with either `LOGIN_REQUIRED` (on `/youtubei/v1/player`) or HTTP
200 + Content-Length 0 (on the timedtext endpoint). This matters for
Vercel deployments because serverless functions run from datacenter IPs.

Approach E routes the request through a third-party site (`notelm.ai`)
as a free fallback — see the "Third-party proxy sites" section at the
bottom for the reasoning, and the table of candidates I evaluated.

## Approaches

| File | Library cost | Strategy |
| ---- | ---- | ---- |
| `aInnertube.ts` | ~0 (native `fetch`) | `POST /youtubei/v1/player` → read `captions.playerCaptionsTracklistRenderer.captionTracks[].baseUrl` → `GET baseUrl&fmt=json3` |
| `bHtmlScraping.ts` | ~0 (native `fetch`) | `GET /watch?v=…` → parse inline `ytInitialPlayerResponse` → `GET baseUrl&fmt=json3` |
| `cYoutubeiCaptions.ts` | `youtubei.js` (~5 MiB) | `Innertube.getInfo(id)` → `info.captions.caption_tracks` → `GET base_url&fmt=json3` |
| `dYoutubeiGetTranscript.ts` | `youtubei.js` (~5 MiB) | `Innertube.getInfo(id).getTranscript()` → uses `/youtubei/v1/get_transcript` (structured segments, no timedtext fetch) |
| `eNotelmProxy.ts` | ~0 (native `fetch`) | `POST https://www.notelm.ai/api/youtube-transcript` — free third-party proxy with no auth/captcha (but with its own rate-limits) |

## Running

```bash
yarn script scripts/transcripts/aInnertube.ts            --url "https://www.youtube.com/watch?v=IVVVvbfRiDo"
yarn script scripts/transcripts/bHtmlScraping.ts         --url "https://www.youtube.com/watch?v=IVVVvbfRiDo"
yarn script scripts/transcripts/cYoutubeiCaptions.ts     --url "https://www.youtube.com/watch?v=IVVVvbfRiDo"
yarn script scripts/transcripts/dYoutubeiGetTranscript.ts --url "https://www.youtube.com/watch?v=IVVVvbfRiDo"
yarn script scripts/transcripts/eNotelmProxy.ts          --url "https://www.youtube.com/watch?v=IVVVvbfRiDo"
```

Each script writes its result to `scripts/output/<approach>-<videoId>.json`
and prints timing/size info to stdout.

## Results from this sandbox (datacenter IP)

Running all five scripts against `https://www.youtube.com/watch?v=IVVVvbfRiDo`
from the Claude agent sandbox (datacenter IP):

| Approach | Status | Where it failed |
| --- | --- | --- |
| A (`aInnertube.ts`) | ❌ failed at stage 1 | `/player` returned `playabilityStatus = LOGIN_REQUIRED — Sign in to confirm you're not a bot` for every client (WEB / ANDROID / IOS). Raw InnerTube POSTs with no visitorData are blocked outright. |
| B (`bHtmlScraping.ts`) | ❌ failed at stage 1 | `/watch` page returned HTTP 429 on a second attempt, and on the first attempt returned a stub page with `captionTracks = []`. |
| C (`cYoutubeiCaptions.ts`) | ⚠️ partial success | `youtubei.js` successfully negotiated visitorData, fetched player response, and extracted `English (auto-generated)` track. The final `fmt=json3` caption fetch then returned HTTP 200 with 0 bytes (silent IP block). |
| D (`dYoutubeiGetTranscript.ts`) | ❌ failed at stage 3 | `/youtubei/v1/get_transcript` returned HTTP 400 FAILED_PRECONDITION even though `youtubei.js` successfully retrieved video metadata. |
| E (`eNotelmProxy.ts`) | ❌ failed at stage 2 | `notelm.ai` returned `videoInfo` + metadata for every video tried, but their upstream fetch to YouTube's timedtext endpoint also hit 429 (same root cause). During one curl run the Gangnam Style video did return 157 auto-caption languages, so the endpoint can work — it's just heavily rate-limited. |

**C got the furthest among the direct approaches** — it proves the full
pipeline up to the final caption blob fetch, which is a pure IP-block
issue. On a residential IP the same script should return full transcript
content with no changes.

## Recommendation

The most reliable approach is **C — `youtubei.js` caption tracks**:

- **Stage 1 (InnerTube init)** — the library handles visitorData +
  client negotiation, which is the step that fails in Approaches A and B.
- **Stage 2 (`getInfo`)** — returns `title`, `channel`, `caption_tracks`
  with a single API call.
- **Stage 3 (timedtext fetch)** — straightforward `fetch(base_url+'&fmt=json3')`.

Approach **D** (`getTranscript()`) is elegant — structured segments with
no json3 parsing — but its `/get_transcript` endpoint seems to have
stricter bot protection than the timedtext endpoint in practice. Use it
as a secondary option when C returns an empty blob.

If you want **zero runtime dependency cost**, **A — direct InnerTube
fetch** is the minimal alternative (~100 lines of code, no
`youtubei.js`). Expect it to be more fragile as YouTube changes client
tokens, and it requires implementing visitorData negotiation yourself
to have any chance on datacenter IPs.

## The datacenter IP caveat

On Vercel, every approach listed here **may silently return no captions**
because YouTube blocks the request IP. The behaviour depends on
YouTube's current threat model and changes daily:

| Symptom | What it means |
| --- | --- |
| `/player` returns `playabilityStatus.status = LOGIN_REQUIRED` | IP is flagged; retry with a different client or back off |
| `/watch` HTML has `captionTracks = []` | Same as above |
| `GET <track.baseUrl>&fmt=json3` returns HTTP 200 / 0 bytes | timedtext endpoint is blocking by IP |
| `/get_transcript` returns HTTP 400 FAILED_PRECONDITION | same root cause, different symptom |

This is why a paid service like `transcriptapi.com` exists: they maintain
rotating residential proxies so the cost of bypassing the block is spread
across many customers.

**Options to de-risk a Vercel deployment:**

1. Run the scraper from a **residential proxy** (e.g. Bright Data, IPRoyal,
   SmartProxy). Pipe all `fetch`/`youtubei.js` traffic through an undici
   `ProxyAgent` — see `shared.ts → setupProxyIfNeeded`.
2. Keep TranscriptAPI as a **fallback** for the IP-block case only.
3. Move transcript extraction to a **cron-triggered serverless region**
   that hasn't been flagged yet, or to a small residential-IP VM.

## Third-party proxy sites (Approach E and why there's only one)

Before accepting the IP-block situation, I surveyed the popular free
YouTube transcript download websites to see whether any of them expose
an unauthenticated API that we can call from our backend as a free
middleman. The short answer: **almost every site that's free for humans
is protected against programmatic access**.

| Site | Why it's not useful as a server-side proxy |
| --- | --- |
| [youtubetotranscript.com](https://youtubetotranscript.com/) | Owned by the same company as `transcriptapi.com`. The free form POST endpoint is behind Cloudflare Turnstile; `curl` gets a "Just a moment…" HTML challenge page. |
| [youtranscripts.com](https://www.youtranscripts.com/) | Vercel-hosted. Datacenter IPs hit a **"Vercel Security Checkpoint"** 429 challenge. |
| [tactiq.io](https://tactiq.io/tools/youtube-transcript) | Front-end POSTs to `{backend}/transcript` with a browser-issued `X-Firebase-AppCheck` token. Firebase App Check requires a reCAPTCHA challenge; you cannot mint a valid token from a headless client. |
| [youtube-transcript.io](https://www.youtube-transcript.io/) | `/api/transcripts` endpoint requires an `x-is-human` challenge header computed by a browser script. Returns `401 missing_authentication` otherwise. |
| [notegpt.io](https://notegpt.io/youtube-transcript-generator) | `/api/v2/video-transcript` endpoint is callable but requires a logged-in session cookie; returns `{"code":164003,"message":"login expired"}`. |
| [notelm.ai](https://www.notelm.ai/youtube-transcript-generator) | **The only site with an anonymous, no-challenge API.** `POST /api/youtube-transcript` works directly from a server. Implemented as Approach E. Has its own rate limits and its upstream fetch to YouTube's timedtext endpoint hits the same 429 block, so it's an unreliable but real fallback. |
| [transcribr.io](https://www.transcribr.io/) | Requires a paid `X-API-Key: tscr_live_…`. Returns `401 missing_api_key`. |
| [supadata.ai](https://supadata.ai/youtube-transcript-api) | Paid API. Returns `401 Missing API Key`. |
| [downsub.com](https://downsub.com/) | Cloudflare Turnstile. `curl` gets a "Just a moment…" challenge. |
| [savesubs.com](https://savesubs.com/) | Cloudflare Turnstile. Same as above. |

**Takeaway:** how does `transcriptapi.com` manage to serve transcripts
reliably and quickly? They maintain a **rotating residential proxy pool**
(and almost certainly cache popular videos). That's the actual product
they're selling, and it's why no free site matches their reliability.
The free sites either (a) charge for anything more than a few manual
captcha-solved requests per day, or (b) do exactly what we're doing and
break silently from datacenter IPs. Approach E (notelm.ai) is the only
"free middleman" option that actually shells out to a datacenter-hostile
backend from our side, and it shares the same underlying failure mode.

If you want a truly reliable free solution, the only real paths are:

1. **Your own residential proxy** (~$0–50/mo for a home VM or small
   rotating proxy plan).
2. **Downloading audio + transcribing** via Whisper / Groq / Deepgram
   (needs a cheap STT budget but no YouTube API at all — immune to the
   IP block because the audio URLs in `streamingData` are served from a
   different, less-guarded Google CDN).
3. **Keep TranscriptAPI as a pay-per-use fallback**, triggered only when
   the free Approach C returns empty.
