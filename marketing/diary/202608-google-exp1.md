# 202608-google-exp1 — Google Search exact-match probe

- **Status:** **live** (launched Aug 16, 2026; campaign id 24149259742; ads in Google review at launch)
- **Channel:** Google Ads / Search / cpc
- **Budget:** $0 spent of $150 cap (platform-enforced campaign total budget)
- **Dates:** Aug 16 – Aug 31, 2026 (~$9.4/day pacing)
- **Hypothesis:** People searching for YouTube summarizer tools have exactly the problem ReadTube solves; the subscription-inbox angle ("your whole feed, readable" vs. one-off paste-a-URL summaries) differentiates enough to convert clicks into signups at ≤ $5 per signup.
- **Decision rule (copied from MARKETING.md at planning time):** Kill if cost per signup > $5 after ~$50 of spend, or zero signups after $30. Iterate if ≤ $5/signup but near-zero activation. Scale (double budget) if ≤ $2.50/signup and ≥ 1/3 of paid signups activate.

## Setup

Configured Aug 16, 2026 as a draft in Google Ads (account 888-925-2284, campaign id 281499115343530, draft id 10209308084):

- **Campaign:** `202608-google-exp1`, Search network only — Display Network OFF, Search Partners OFF, AI Max OFF, Final URL expansion OFF.
- **Budget:** **campaign total budget $150** (the new Search total-budget type — platform-enforced hard cap), campaign dates Sep 15 – Sep 30, 2026. Dates are placeholders for the cap math (~$10/day); owner adjusts at launch.
- **Bidding:** Maximize Clicks with a **$2 max CPC bid limit** (verify the limit persisted at publish — it was entered before an identity-check interruption).
- **One ad group** (the new-campaign wizard only supports one; split by theme later if per-keyword data justifies it), exact match:
  - `[youtube summarizer]`
  - `[youtube video summarizer]`
  - `[summarize youtube video]`
  - `[ai youtube summary]`
  - `[youtube video summary generator]`
  - `[youtube video to text]`
  - `[youtube video to article]`
  - `[youtube transcript summary]`
  - `[read youtube videos]`
- **Negative keywords (add after publish):** `free download`, `apk`, `mp3`, `mp4`, `downloader` (summarizer searches attract downloader traffic).
- **One RSA (`utm_content=rsa-a`):**
  - Headlines (≤30 chars): "Read Your YouTube Videos" · "YouTube as a Newsletter" · "Turn Videos Into Articles" · "Summaries + Full Articles" · "Your Subscriptions, Readable" · "Skim, Search & Annotate" · "Stop Scrolling, Start Reading" · "Free During Beta"
  - Descriptions (≤90 chars):
    - "ReadTube turns your YouTube subscriptions into a readable, searchable inbox of articles."
    - "Every new video becomes a summary and a full article. Star, save, annotate. Free beta."
    - "More than a one-off summarizer: your whole subscription feed as readable posts."
    - "Search everything you follow. Notes and highlights included. Free while in beta."
- **Final URL:** `https://www.read.tube/?utm_source=google&utm_medium=cpc&utm_campaign=202608-google-exp1&utm_content=rsa-a`
- **Campaign final-URL suffix:** `utm_term={keyword}` (ValueTrack fills the matched keyword).
- **Targeting:** US + CA + UK + AU (English), all devices. ReadTube is a desktop-leaning product but signup works on mobile and attribution is website-side, so no device exclusion for the probe; watch the device split at reviews.
- **Launch preconditions:** owner approves the $150 cap; owner completes Google's "Confirm it's you" identity check (mandatory after Aug 28, 2026) and publishes the draft; verify the $2 max-CPC limit survived; keep the campaign paused or push the start date if not ready to spend.

## Execution log

<!-- Append a dated entry at every review touchpoint. Never rewrite old entries. -->

### 2026-08-16

Campaign built end-to-end in the Google Ads UI (Claude via browser) and saved as a draft — $0 spent, nothing published. Findings from the session:

- The "$500 credit" is the **spend $500, get $500 by Oct 13, 2026** intro offer on the Marauder Bot account (progress bar reads "$500 away from $500 credit"). It is a match on real spend, not free budget. There is no separate ReadTube ads account, so the campaign was created in account 888-925-2284 to count toward that offer; combined Google spend across both products must reach $500 by Oct 13 for the credit to pay out.
- Search campaigns now support a **campaign total budget** (requires start+end dates) — used it for a platform-enforced $150 cap instead of the manual review-touchpoint enforcement the plan assumed.
- The new-campaign wizard allows only **one ad group**, so all 9 exact-match keywords live together; per-keyword performance still separates via the keywords report and `utm_term={keyword}`.
- **Blocker:** at the budget/review step Google demanded a "Confirm it's you" re-authentication (skippable until Aug 28, 2026; the review error-check then hung with "Changes failed to save"). Publishing needs the owner: open Campaigns → the `202608-google-exp1` draft, complete the identity check, re-confirm budget ($150 total / Sep 15–30) and the $2 max-CPC limit, publish, and pause (or leave the future start date as the safety).

### 2026-08-16 (later) — published

Owner completed the identity check; Claude resumed in the same browser session and finished the build:

- Post-mortem on the earlier "Changes failed to save": the identity gate had silently blocked *all* writes in the first session — the budget, keywords, and ad never persisted (only bidding + campaign settings + the $2 max-CPC limit survived). Re-entered the campaign-total budget ($150, Sep 15–30), all 9 exact-match keywords, and the full RSA; saves confirmed ("All changes saved").
- **Published** → campaign id **24149259742** — then immediately **paused** (owner approval still required to start spend; the Sep 15 start date is the second safety).
- Added campaign-level negative keywords post-publish: `free download`, `apk`, `mp3`, `mp4`, `downloader`.
- Verified in live campaign settings: Search Network only, broad-match off, AU/CA/UK/US + English, start/end dates, campaign total $150, Maximize Clicks, final URL suffix `utm_term={keyword}`.
- To launch: owner (or Claude with owner approval) flips the campaign from Paused to Enabled; ads then enter Google's ad review and serving starts no earlier than Sep 15. Pull the dates earlier at launch if desired.

### 2026-08-16 (launch)

Owner approved launch ("Please launch"). Launch sequence:

- Pulled campaign dates to **Aug 16 – Aug 31, 2026** ($150 over 16 days ≈ $9.4/day, matching the planned pace) and enabled the campaign.
- **Surprise:** the campaign showed "Campaign has no ad groups" — the wizard's publish had created only the campaign-level objects (budget, bidding, targeting, URL suffix); the ad-group-level entities (keywords + ad) were dropped, a further casualty of the draft wizard's identity-gate save corruption. The wizard's own review page had listed "Create an ad / Add keywords" as issues before the fix session, and the fix apparently only lived in the draft, not the published campaign.
- Rebuilt directly on the **live** campaign via the standard ad-group editor (reliable, no draft state): ad group `summarizer-intent`, all 9 exact-match keywords, the `rsa-a` ad with UTM final URL, 8 headlines, 4 descriptions.
- Verified live: ad group **Eligible**; ad and keywords **Pending / Under review** (normal pre-serving ad review); negative keywords already in place at campaign level.
- Lesson for E2+: skip the new-campaign wizard's draft flow entirely — create the campaign shell, then build ad groups/keywords/ads through the post-publish editors, verifying each entity in the tables afterward.
- Next review touchpoint: ~Aug 19–20 (check ad approval, impressions/clicks, and the attribution report).

## Findings

## Outcome
