# 202608-google-exp1 — Google Search exact-match probe

- **Status:** planned
- **Channel:** Google Ads / Search / cpc
- **Budget:** $0 spent of $150 cap
- **Dates:** not launched
- **Hypothesis:** People searching for YouTube summarizer tools have exactly the problem ReadTube solves; the subscription-inbox angle ("your whole feed, readable" vs. one-off paste-a-URL summaries) differentiates enough to convert clicks into signups at ≤ $5 per signup.
- **Decision rule (copied from MARKETING.md at planning time):** Kill if cost per signup > $5 after ~$50 of spend, or zero signups after $30. Iterate if ≤ $5/signup but near-zero activation. Scale (double budget) if ≤ $2.50/signup and ≥ 1/3 of paid signups activate.

## Setup

Planned configuration (fill in with actuals at launch):

- **Campaign:** `202608-google-exp1`, Search network only — Display expansion OFF, search-partners OFF. No broad-match expansion, no auto-applied recommendations.
- **Budget:** $10/day, **$150 total cap** — Google Search campaigns have no total-budget setting, so the cap is enforced at review touchpoints (pause at ≥ $150 cumulative) plus an automated rule if available.
- **Bidding:** Manual CPC (or Maximize Clicks with a **$2 max CPC bid limit**) while conversion volume is too low for smart bidding.
- **Ad group 1 — "summarizer intent"** (exact match):
  - `[youtube summarizer]`
  - `[youtube video summarizer]`
  - `[summarize youtube video]`
  - `[ai youtube summary]`
  - `[youtube video summary generator]`
- **Ad group 2 — "video to text intent"** (exact match):
  - `[youtube video to text]`
  - `[youtube video to article]`
  - `[youtube transcript summary]`
  - `[read youtube videos]`
- **Negative keywords:** `free download`, `apk`, `mp3`, `mp4`, `downloader` (summarizer searches attract downloader traffic).
- **One RSA (`utm_content=rsa-a`), both ad groups:**
  - Headlines (≤30 chars): "Read Your YouTube Videos" · "YouTube as a Newsletter" · "Turn Videos Into Articles" · "Summaries + Full Articles" · "Your Subscriptions, Readable" · "Skim, Search & Annotate" · "Stop Scrolling, Start Reading" · "Free During Beta" · "Follows Your Channels" · "Read Videos in Your Language" · "Search Every Video You Follow"
  - Descriptions (≤90 chars):
    - "ReadTube turns your YouTube subscriptions into a readable, searchable inbox of articles."
    - "Every new video becomes a summary and a full article. Star, save, annotate. Free beta."
    - "More than a one-off summarizer: your whole subscription feed, delivered as readable posts."
    - "Search everything you follow. Notes and highlights included. Free while in beta."
- **Final URL:** `https://www.read.tube/?utm_source=google&utm_medium=cpc&utm_campaign=202608-google-exp1&utm_content=rsa-a`
- **Campaign final-URL suffix:** `utm_term={keyword}` (ValueTrack fills the matched keyword).
- **Targeting:** US + CA + UK + AU (English), all devices. ReadTube is a desktop-leaning product but signup works on mobile and attribution is website-side, so no device exclusion for the probe; watch the device split at reviews.
- **Launch preconditions:** owner approves the $150 cap; verify the $500 promotional credit's terms in Billing → Promotions (spend-match requirement and expiry) and pace spend accordingly.

## Execution log

<!-- Append a dated entry at every review touchpoint. Never rewrite old entries. -->

## Findings

## Outcome
