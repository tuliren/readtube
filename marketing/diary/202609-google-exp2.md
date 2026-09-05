# 202609-google-exp2 — Google Search transcript-intent probe

- **Status:** planned (re-scoped Sep 4, 2026 from the original competitor-alternative angle; pending owner approval of the re-scope and the cap; blocked on the transcript landing page)
- **Channel:** Google Ads / Search / cpc
- **Budget:** $0 spent of $150 cap (proposed)
- **Dates:** 14 days from launch (target: mid/late Sep 2026, so spend lands before the Oct 13 credit deadline)
- **Hypothesis:** "youtube transcript" searchers are the only Google Search demand pocket with real volume at probe CPCs (E1: ~85% of impressions, $0.56–0.82 CPC, 13–15% click→signup). They activated at 27% in E1 even though nothing on the homepage or in the first-run inbox spoke to them. A landing page and first-run flow built around "paste a link, get the transcript, summary and article" should lift activation past one third and bring cost per signup under $5, which would make this the first scalable paid channel.
- **Decision rule (copied from MARKETING.md at planning time):** Kill if cost per signup > $5 after ~$50 of spend, or zero signups after $30. Iterate if ≤ $5/signup but near-zero activation. Scale (double budget) if ≤ $2.50/signup and ≥ 1/3 of paid signups activate. Experiment-specific: "activated" here means the signup added a video (the page is built for that), so also kill if fewer than 1 in 5 signups add a video after ~$75.

## Setup

Proposed; nothing is built in Google Ads yet. Build through the post-publish editors, never the new-campaign draft wizard (E1 lesson: it silently dropped the ad-group entities).

- **Campaign:** `202609-google-exp2`, Search network only (Display, Search Partners, AI Max, final-URL expansion all OFF). Targeting US + CA + UK + AU, English, all devices. Campaign total budget **$150** with start/end dates 14 days apart. Maximize Clicks with a **$1.50 max-CPC limit** (transcript auctions cleared at $0.56–0.82 in E1; the $3 cap was only ever needed for summarizer terms).
- **Ad group `transcript-intent`** (primary), exact match: `[youtube transcript]`, `[youtube video transcript]`, `[youtube transcript generator]`, `[get youtube transcript]`, `[transcribe youtube video]`, `[youtube to text]`, `[youtube video to text]`, `[youtube transcript summary]`.
- **Ad group `alternative-intent`** (optional secondary, homepage landing, ≤ $30 of the cap): `[eightify alternative]`, `[notegpt alternative]`, `[youtube summarizer alternative]`. Expected to barely serve; included only so the original E2 angle gets a free volume read.
- **Negative keywords (campaign level):** `free download`, `apk`, `mp3`, `mp4`, `downloader`, `extension`, `chrome`, `api`, `python` (extension/API searchers want a different product).
- **Landing page:** `/youtube-transcript` (to be built on the Z track; not shipped yet). Requirements: a paste-a-YouTube-URL input above the fold; copy that promises the transcript, the summary and the readable article, works without captions, free during beta; the pasted URL survives sign-up and pre-opens the Add video modal so the first session ends with a video in the library; a "follow the channel" upsell after the first article. Sign-up CTA on the page carries the same UTMs.
- **Final URL:** `https://www.read.tube/youtube-transcript?utm_source=google&utm_medium=cpc&utm_campaign=202609-google-exp2&utm_content=rsa-a`
- **Campaign final-URL suffix:** `utm_term={keyword}`.
- **RSA `rsa-a`** (draft; all claims map to shipped features):
  - Headlines (≤30): "YouTube Transcript + Summary" · "Read Any YouTube Video" · "Paste a Link, Get the Text" · "Transcript, Summary, Article" · "Works Without Captions" · "Search & Highlight the Text" · "Free During Beta" · "No Extension Needed"
  - Descriptions (≤90):
    - "Paste a YouTube link. Get a clean transcript, summary, and readable article. Free beta."
    - "Works even when the video has no captions. Search, highlight, and annotate the text."
    - "Follow the channel too and every new video arrives as a readable post in your inbox."
    - "More than a transcript: summaries and full articles in your language. Free while in beta."
- **Assets:** reuse E1's campaign-scoped callouts and structured snippet; sitelinks: Paste a Video → /youtube-transcript, How It Works → /#features, Pricing → /#pricing, FAQ → /#faq.
- **Launch preconditions:** (1) the first-run empty-state PR from the Sep 4 cycle is merged; (2) `/youtube-transcript` is live with the paste-URL flow; (3) owner approves the re-scope and the $150 cap; (4) Google's "Confirm it's you" check is clear before any writes.

## Execution log

<!-- Append a dated entry at every review touchpoint. Never rewrite old entries. -->

### 2026-09-04

Planned during the E1 close-out cycle. Rationale and the E1 numbers this rests on are in `202608-google-exp1.md` (Sep 4 entry and Findings). Nothing configured in Google Ads; $0 spent. Waiting on the landing page and owner approval.

## Findings

## Outcome
