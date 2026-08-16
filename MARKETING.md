# Marketing Plan

Goal: maximize **quality signups and activated users** through ads and marketing, via **small incremental experiments** — never spend the budget upfront. Initial budget: the **$500 Google Ads credit** already on the account (expandable if a channel proves out).

**Operator: Claude Code.** This plan is executed by Claude in this repo, session over session. Division of labor:

- **Claude does:** write all ad copy/creatives and landing content, construct UTM-tagged links, set up and adjust campaigns by driving the local browser against the owner's logged-in ad accounts, run the attribution report, apply the decision rules, keep the budget ledger and experiment queue below up to date, and ship funnel/SEO code changes via PRs.
- **Owner does:** keep ad-account billing valid, approve each new experiment's budget cap before launch (starting or increasing spend always requires owner approval; stopping spend does not), confirm the interactive `yarn script:prod` prompt (or run it), and press "submit" on anything published under a human identity (Product Hunt, Show HN, community posts, sponsorship outreach emails).
- **Cadence:** while an experiment is live, Claude reviews performance every 3–4 days (attribution report + ad-platform dashboard), makes the kill/iterate/scale call per the framework below, and carries the experiment forward accordingly. Any session picking up this work should read this file first — it is the source of truth for budget state and experiment status; per-experiment history lives in the diary (below).

## Context and constraints

- Product: ReadTube (https://www.read.tube) — turns YouTube (and Bilibili) subscriptions into a readable, searchable, annotatable inbox of AI-written summaries and articles. The differentiator vs. one-off "paste a URL" summarizers (Eightify, NoteGPT, Recall, etc.): it follows your **subscriptions** continuously, like a newsletter inbox, with search, notes, and multi-language articles.
- Pricing: **free during beta**. Paid tiers (Curator $10/mo, Scholar $30/mo) are "coming soon" and not purchasable — there is no Stripe integration yet. So there is no CAC-vs-LTV math to run; the funnel we can optimize today is **visit → signup → activation**.
- Success metrics, in order:
  1. **Cost per signup** (`SignupAttribution` row per signup, attributed by UTM).
  2. **Activation rate of paid signups** — an activated signup subscribed to ≥1 channel or added ≥1 video, and consumed something. A channel that delivers cheap signups who never activate is still a dead channel.
- Guardrail while free: treat **$5/signup** as the ceiling and **$2.50/activated-signup-adjacent** as the "interesting" line. These are placeholders until we see real numbers; tighten them once paid tiers exist and real LTV is measurable.
- **Ad policy: no known risk.** Unlike Marauder Bot (blocked by Google's "dishonest behavior" policy), ReadTube is a wholesome productivity/reading tool. Standard approvals expected. Keep ad copy claims mapped to real, shipped features anyway.
- **Google Ads credit caveat:** Google's standard intro offer is *spend $500, get $500* — the credit usually pays out only after matching real spend within 60 days of redemption, and only spend *after* redemption counts. Before treating the $500 as free budget, verify in the account (Billing → Promotions) what the actual terms and expiry are, and plan spend pacing around the deadline.
- Reddit ads: the existing Reddit Ads account belongs to Marauder Bot. Reddit's Business Manager does support multiple ad accounts per business, but creating additional ad accounts is limited to **managed** businesses (ones with a Reddit sales rep); self-serve advertisers effectively get one ad account per Reddit login. The workaround is a second Reddit user account on a different email (a Gmail `+` alias works) which can then be invited into the same Business Manager. Deprioritized: not needed for the current queue, and organic Reddit (Z track) comes first anyway.

## Assets

- **Product Hunt launch package — ready, unlaunched.** A full review page lives at `/producthunt` (`apps/web/src/app/producthunt/`): tagline, description, topics, maker comment, and server-rendered gallery images. The `ProductHuntButton` is present but commented out in `Hero.tsx`/`Header.tsx`. This is the highest-leverage zero-dollar asset on the shelf.
- **Landing page:** hero with rotating verb + "Get Started" → `/sign-up` (Clerk), features ("Built for depth, not distraction"), pricing, FAQ. Public sample-video previews in the hero dropdown.
- **SEO surface:** indexable public reader pages (`/p/videos/[videoId]`) with sitemap, robots.txt, canonicals, and a signup CTA — shipped in PRs #138–#141.

## Tracking (already in place)

First-touch attribution is captured automatically: `UtmParamTracker` stores UTM params / referrer / landing page in localStorage (earliest wins), and after sign-in `AttributionTracker` writes one `SignupAttribution` row per user (see DESIGN.md "Signup attribution"). A `signed_up` Vercel Analytics event fires alongside. Reporting:

```bash
cd apps/web
yarn script:prod scripts/reportSignupAttribution.ts --days 30                      # by source / medium / campaign
yarn script:prod scripts/reportSignupAttribution.ts --days 30 --group-by term      # per keyword / audience
yarn script:prod scripts/reportSignupAttribution.ts --days 30 --group-by content   # per ad creative
yarn script:prod scripts/reportSignupAttribution.ts --days 30 --group-by landing   # per landing page (organic/SEO)
```

The report shows, per group: signups → activated (subscribed a channel or added a video) → consumed (read at least one video) → generations requested.

### UTM conventions (mandatory for every paid link)

All ad links must land on **www.read.tube** and carry:

| Param | Convention | Example |
| --- | --- | --- |
| `utm_source` | platform | `google`, `reddit`, `newsletter-<name>` |
| `utm_medium` | buying model | `cpc`, `sponsorship`, `social` |
| `utm_campaign` | `<yyyymm>-<channel>-exp<N>` | `202608-google-exp1` |
| `utm_term` | keyword / audience | `youtube-summarizer` (Google: use `{keyword}` ValueTrack in a final-URL suffix) |
| `utm_content` | creative variant | `rsa-a` |

Example: `https://www.read.tube/?utm_source=google&utm_medium=cpc&utm_campaign=202608-google-exp1&utm_term={keyword}&utm_content=rsa-a`

## Experiment framework

Each experiment gets: a hypothesis, a budget cap, a duration, and a **decision rule written down before launch**. Default rules:

- **Kill** if cost per signup > $5 after ~$50 of spend, or zero signups after $30.
- **Iterate** (new keywords/creative, same channel) if cost per signup ≤ $5 but activation is near zero.
- **Scale** (double budget) if cost per signup ≤ $2.50 and at least a third of paid signups activate.
- Review cadence: every 3–4 days per running experiment; never more than one *new* channel in flight at a time.

## Experiment queue

### E1 — Google Search exact-match probe (~$150 cap) — planned

Hypothesis: people searching for YouTube summarizer tools have exactly the problem ReadTube solves, and the subscription-inbox angle differentiates it enough to convert clicks into signups at ≤ $5.

- Campaign `202608-google-exp1`: Search-only (no Display/Search-partner expansion), exact-match high-intent keywords — `[youtube summarizer]`, `[youtube video summarizer]`, `[summarize youtube video]`, `[ai youtube summary]`, `[youtube video to text]`, `[youtube video to article]`, `[youtube transcript summary]`, `[read youtube videos]` — one RSA, ~$10/day, capped at $150 total, max CPC ~$2.
- Landing: homepage with full UTMs per the convention above (`utm_term={keyword}` via final-URL suffix).
- Success: per the decision rules; compare keywords via `--group-by term`.
- Details and exact copy: `marketing/diary/202608-google-exp1.md`.

### E2 — Google competitor/alternative angle (~$100 cap) — after E1

Second Google probe informed by E1's per-keyword results: competitor-alternative keywords (`[eightify alternative]`, `[notegpt alternative]`, `[recall ai alternative]`) plus whatever E1's `--group-by term` says worked, paired with comparison landing content from the Z track. Only runs if E1 isn't an outright kill of the channel.

### E3 — Micro-sponsorship (~$100–150, one slot) — later

One niche newsletter or small creator in the productivity / PKM / digital-minimalism space, chosen after E1/E2 results. Sponsored links carry `utm_source=newsletter-<name>` / `utm_medium=sponsorship`. Human-negotiated, no platform review.

### Z — Zero-dollar track (runs continuously alongside)

- **Product Hunt launch** — the package is built and waiting at `/producthunt`. Owner submits; Claude preps final copy and timing. Do this before or alongside E1: paid clicks convert better when the product has social proof.
- **Show HN** — the source-available angle (ELv2, self-hostable) plays well there. Owner submits.
- **Organic Reddit** — r/productivity, r/digitalminimalism, r/InternetIsBeautiful, r/SideProject; genuine posts, not link drops. Owner submits.
- **SEO comparison/alternative pages** — "Eightify alternative", "NoteGPT alternative", "best YouTube summarizer" style pages; the category has heavy listicle competition but ReadTube's subscription-inbox angle is a real differentiator. Watch `--group-by landing` for which pages convert.
- **Public video pages** — already shipped; monitor indexing in Search Console and signups via `landing_page` values.
- **Funnel conversion work** — at a few hundred visitors, signup-rate improvements beat more traffic.

## Budget ledger

| Date | Experiment | Spend | Signups | Activated | Decision |
| --- | --- | --- | --- | --- | --- |
| — | — | $0.00 | — | — | nothing live yet |

Total spent: **$0.00**. Credit status: $500 promotional credit on the Google Ads account — terms (spend-match requirement, expiry) to be verified in-account before E1 launches.

## Experiment diary

Every experiment gets a diary file in **`marketing/diary/`**, named after its `utm_campaign` id (e.g. `202608-google-exp1.md`), following `marketing/diary/TEMPLATE.md`. The diary is the durable memory of execution: setup with exact UTM links, a dated execution log appended at every review touchpoint (never rewritten), findings, and the final outcome with the kill/iterate/scale decision. Create the file at planning time (status `planned`), fill in Setup at launch, and close it out with Outcome when the experiment ends — killed experiments record their findings too. The ledger above stays the at-a-glance budget summary; the diaries hold the detail.
