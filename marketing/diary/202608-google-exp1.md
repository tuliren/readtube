# 202608-google-exp1 — Google Search exact-match probe

- **Status:** planned (campaign fully configured as a draft in Google Ads; blocked on owner identity check + publish, see log)
- **Channel:** Google Ads / Search / cpc
- **Budget:** $0 spent of $150 cap
- **Dates:** not launched; campaign dates set to Sep 15 – Sep 30, 2026 (adjust at launch)
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

## Findings

## Outcome
