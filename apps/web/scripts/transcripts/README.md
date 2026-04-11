# Transcript fetching experiments

Scripts to benchmark different ways of fetching a YouTube video's native
transcript for **free**, without:

- paying `transcriptapi.com` or another third-party transcript service;
- signing in to YouTube;
- shelling out to `yt-dlp` / `ffmpeg` (Vercel serverless can't run them).

All approaches hit `www.youtube.com` directly. They therefore share the
same fundamental weakness: **YouTube aggressively rate-limits /
bot-blocks datacenter IPs**. When the request IP is flagged, YouTube
responds with either `LOGIN_REQUIRED` (on `/youtubei/v1/player`) or HTTP
200 + Content-Length 0 (on the timedtext endpoint). This matters for
Vercel deployments because serverless functions run from datacenter IPs.

## Approaches

| File | Library cost | Strategy |
| ---- | ---- | ---- |
| `aInnertube.ts` | ~0 (native `fetch`) | `POST /youtubei/v1/player` → read `captions.playerCaptionsTracklistRenderer.captionTracks[].baseUrl` → `GET baseUrl&fmt=json3` |
| `bHtmlScraping.ts` | ~0 (native `fetch`) | `GET /watch?v=…` → parse inline `ytInitialPlayerResponse` → `GET baseUrl&fmt=json3` |
| `cYoutubeiCaptions.ts` | `youtubei.js` (~5 MiB) | `Innertube.getInfo(id)` → `info.captions.caption_tracks` → `GET base_url&fmt=json3` |
| `dYoutubeiGetTranscript.ts` | `youtubei.js` (~5 MiB) | `Innertube.getInfo(id).getTranscript()` → uses `/youtubei/v1/get_transcript` (structured segments, no timedtext fetch) |

## Running

```bash
yarn script scripts/transcripts/aInnertube.ts            --url "https://www.youtube.com/watch?v=IVVVvbfRiDo"
yarn script scripts/transcripts/bHtmlScraping.ts         --url "https://www.youtube.com/watch?v=IVVVvbfRiDo"
yarn script scripts/transcripts/cYoutubeiCaptions.ts     --url "https://www.youtube.com/watch?v=IVVVvbfRiDo"
yarn script scripts/transcripts/dYoutubeiGetTranscript.ts --url "https://www.youtube.com/watch?v=IVVVvbfRiDo"
```

Each script writes its result to `scripts/output/<approach>-<videoId>.json`
and prints timing/size info to stdout.

## Results from this sandbox (datacenter IP)

Running all four scripts against `https://www.youtube.com/watch?v=IVVVvbfRiDo`
from the Claude agent sandbox (datacenter IP):

| Approach | Status | Where it failed |
| --- | --- | --- |
| A (`aInnertube.ts`) | ❌ failed at stage 1 | `/player` returned `playabilityStatus = LOGIN_REQUIRED — Sign in to confirm you're not a bot` for every client (WEB / ANDROID / IOS). Raw InnerTube POSTs with no visitorData are blocked outright. |
| B (`bHtmlScraping.ts`) | ❌ failed at stage 1 | `/watch` page returned HTTP 429 on a second attempt, and on the first attempt returned a stub page with `captionTracks = []`. |
| C (`cYoutubeiCaptions.ts`) | ⚠️ partial success | `youtubei.js` successfully negotiated visitorData, fetched player response, and extracted `English (auto-generated)` track. The final `fmt=json3` caption fetch then returned HTTP 200 with 0 bytes (silent IP block). |
| D (`dYoutubeiGetTranscript.ts`) | ❌ failed at stage 3 | `/youtubei/v1/get_transcript` returned HTTP 400 FAILED_PRECONDITION even though `youtubei.js` successfully retrieved video metadata. |

**C got the furthest** — it proves the full pipeline up to the final
caption blob fetch, which is a pure IP-block issue. On a residential IP
the same script should return full transcript content with no changes.

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
