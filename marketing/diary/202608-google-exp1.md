# 202608-google-exp1 — Google Search exact-match probe

- **Status:** **iterating** (launched Aug 16, 2026; campaign id 24149259742; first review Aug 20 paused the off-thesis vampire keyword)
- **Channel:** Google Ads / Search / cpc
- **Budget:** $35.90 spent of $150 cap (platform-enforced campaign total budget), as of Aug 20, 2026
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

- The "$500 credit" is the **spend $500, get $500 by Oct 13, 2026** intro offer on the existing shared ads account (progress bar reads "$500 away from $500 credit"). It is a match on real spend, not free budget. There is no separate ReadTube ads account, so the campaign was created in account 888-925-2284 to count toward that offer; combined Google spend across both products must reach $500 by Oct 13 for the credit to pay out.
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

### 2026-08-17 — conversion tracking + ad assets

Owner asked about richer ad formats and Google's conversion-tracking nag; approved doing both. Not a scheduled review touchpoint, but early numbers were visible in passing: **ad approved and serving** — 53 impressions, 4 clicks, $4.84 spent, 7.55% CTR, $1.21 avg CPC (campaign-to-date, Aug 16–17). No attribution-report pull; first real read stays at the Aug 19–20 touchpoint.

- **Conversion action created** (Goals → Conversions wizard): category Sign-up, name **"ReadTube sign-up"**, manual event via code, primary, one-per-click, same-value $1, data-driven attribution, data source www.read.tube. The Google tag for the account is `AW-18390610665`; the event snippet `send_to` is `AW-18390610665/4gm1CLemouMcEOnlqcFE`. The goal shows **"Misconfigured"** until the tag ships and the first conversion arrives — expected, not an error.
  - **Declined enhanced conversions** (the wizard pre-checks it): it is an account-wide data-processing agreement (hashed user emails to Google) on an account shared with the other product — owner's call, and not needed for signup counting. Unchecking it turned "Agree and finish" into plain "Finish".
  - Wired in the same session via PR: gtag.js loads site-wide in production (`GoogleAdsTag` in the root layout, gated on `VERCEL_ENV === 'production'`), and `AttributionTracker` fires the conversion exactly when a `SignupAttribution` row is recorded — so Google's conversion count should track the `signed_up` event 1:1 (minus ad blockers). No consent banner exists; UK/EEA visitors are tracked without consent mode, a known gap if targeting ever leans on the UK.
- **Ad assets added** (all campaign-scoped to `202608-google-exp1`, none account-level — the account is shared):
  - 4 sitelinks: Sign Up Free → /sign-up · How It Works → /#features · Pricing → /#pricing · FAQ → /#faq, each with two description lines.
  - 6 callouts: Follows Subscriptions · Free During Beta · AI Summaries & Articles · Search Your Videos · Notes & Highlights · Multi-Language Articles.
  - 1 structured snippet: Service catalog — Video Summaries, Full Articles, Subscription Inbox, Search & Notes, Multi-Language.
  - Sitelinks and callouts went **Eligible within minutes**; the structured snippet was still Pending at session end. The campaign-level final-URL suffix (`utm_term={keyword}`) applies to sitelink clicks, so attribution holds.
- **Image assets: not available on this account.** No "Image" type exists in the asset menus, and the RSA editor's "More asset types" (8 total) has no Images either — Google gates image assets on account eligibility and simply hides the option. Prepared 1200×628 and 1200×1200 crops from the `/producthunt` gallery anyway (hero card + clean inbox-UI square); revisit if the option appears. Business name/logo (replacing the generic globe icon in ads) needs account-level advertiser verification — owner's call, low priority for a $150 probe.
- Housekeeping: the Google Ads account under this login is named "Marauder Bot" (the other product); the ReadTube campaign lives inside it as planned. The ads account is reachable via the owner's liren@starfish.sh Google session, not tuliren@gmail.com.

### 2026-08-20 — first scheduled review: iterate

First full data read (campaign lifetime Aug 16–20, Google Ads + attribution DB):

- **Campaign totals:** $35.90 spent of $150 · 581 impressions · 65 clicks · 11.19% CTR · $0.55 avg CPC · 9 Google-tracked conversions ($3.99/conv). Attribution DB: **12 signups → 2 activated → 0 consumed → 0 generations** (google/cpc/202608-google-exp1). DB 12 vs Google 9 is the expected ad-blocker gap on gtag. **Cost per signup $2.99** (DB numbers).
- **Per-keyword (the real story):** `[youtube video to text]` took 527 of 581 impressions, 62 of 65 clicks, $34.57 of $35.90, and all 9 conversions — every DB signup carries `utm_term=youtube video to text`. The 8 true summarizer keywords combined: 54 impressions, 3 clicks, $1.33, 0 conversions; head term `[youtube summarizer]` got 24 impressions and 0 clicks. Maximize Clicks did what it does: bought the cheapest clicks, and the cheapest clicks are transcription intent, while the $2 max-CPC cap loses the summarizer auctions.
- **Read:** transcription-intent visitors sign up remarkably well (14.5% click→signup) but do not activate (2/12 subscribed/added, nobody read anything). Cheap signups that never activate — exactly the dead-channel pattern the plan warns about. The actual hypothesis (summarizer intent converts) is still **untested**: those keywords barely served.
- **Decision (per rule):** cost/signup ≤ $5 with near-zero activation → **iterate**, not kill.
- **Actions taken:**
  - **Paused `[youtube video to text]`** (autonomous — contains low-quality spend). Verified Paused in the live keywords table; the other 8 keywords remain Eligible.
  - Prepared raising the Maximize Clicks max-CPC limit **$2 → $3** so summarizer terms can win auctions (campaign total stays capped at $150). **Blocked by the session permission layer as a live-spend change → pending owner approval**; bidding left at $2 (settings panel closed without saving).
  - Fixed `scripts/reportSignupAttribution.ts` (Prisma 6 binds numbers as bigint; `make_interval` needs `::int` cast) — the report was erroring before any data pull.
- **What Aug 23 decides:** with the vampire paused, do summarizer keywords get impressions/clicks at all? If they serve and convert, E1 finally tests its hypothesis. If spend flatlines at the $2 cap (and the bid raise isn't approved), exact-match summarizer volume is effectively unwinnable at probe CPCs → close E1 and move the remaining ~$114 toward E2's competitor-alternative angle.
- **Z-track lead:** "youtube video to text" is a genuine demand pocket with dirt-cheap signups; the homepage just doesn't speak to it. A dedicated landing page routing that intent into add-video + AI transcripts (PR #145) could turn it into an activating funnel — candidate for a future cycle (zero-dollar, then possibly re-enable the keyword pointed at that page).

### 2026-08-20 (later) — max-CPC raise approved and applied

Owner approved the bid raise in-session. Set the Maximize Clicks max-CPC limit **$2.00 → $3.00** in campaign settings and verified it persisted: after a full page reload, the Bidding editor reads $3.00 from server state (the launch session's silent-save failure mode did not recur; no identity check appeared). Change history separately confirms the earlier keyword pause (`1 exact match keyword paused`, Aug 20 2:34 PM PT, campaign `202608-google-exp1` / ad group `summarizer-intent`). Campaign total budget unchanged at $150, dates unchanged (Aug 16–31). Nothing further pending owner approval for E1.

## Findings

## Outcome
