# Revenue Strategy

Analysis date: **Aug 23, 2026**; revised **Sep 4, 2026** against E1's final numbers and the current code. Grounded in `MARKETING.md` (funnel state, experiment data), `DESIGN.md` (pipeline assets, unit costs), and the current billing state. Uncommitted working doc.

## Current state

- **Revenue is $0 by construction.** Paid tiers (Curator $10/mo, Scholar $30/mo) are "coming soon" on the landing page with no billing integration (still true Sep 4: no Stripe or Clerk Billing code in the repo). Quota metering exists (`UserRequest` audit log, `/usage` page showing a 500/month allotment from `lib/usage/quota.ts`) but has **no enforcement**: no generation route reads the quota.
- The funnel being optimized today is visit → signup → activation; CAC is being measured against an unknown LTV.
- Key assets already built:
  - Chunked Gemini AI-transcription pipeline for caption-less videos, measured at **~$0.35/video-hour** all-in ($0.30 transcription + ~$0.03 summary; ~$0.12 for a typical 20-minute video). Levers to ~$0.08–0.15 (flex tier, dropping video-frame tokens) are identified but blocked on AI Gateway support, since the pipeline has to call the native Gemini API for clipping.
  - Summary/article generation (single-pass + map-reduce), multi-language.
  - Search infra (tsvector + trigram GIN, plus pgvector embeddings behind the ask-my-inbox RAG chat), public SEO reader pages + sitemap, signup attribution.
  - Source-available (ELv2), self-hostable.
- Key experiment signal (E1, Google Ads, Aug 16–31, 2026, concluded and killed): $149.72 bought 29 signups at **$5.16 each, 21% activated, 2 readers**. The search-terms report shows ~85% of spend went to the plain query "youtube transcript" through close-variant matching, whichever transcript-flavored keyword was enabled; that traffic converted at 13–15% click→signup, $2.88–6.09 per signup, and produced every activation, read, and generation in the experiment (6/22 activated). True summarizer-intent exact terms have almost no volume (~200 impressions in 16 days across four countries) and activated 0/7. Follow-up: E2 is re-scoped to a transcript-intent probe with a dedicated paste-a-URL landing page (`marketing/diary/202609-google-exp2.md`, pending approval).
- **Activation is the measured bottleneck, not traffic:** across every source in Aug 5 – Sep 4 (paid, organic Google, direct), 54 signups → 8 activated → 3 consumed. Organic Google alone brought 21 signups → 1 activated. The first-run empty state only offered "add a channel" until the Sep 4 fix added a paste-a-video path. Any willingness-to-pay data collected before activation improves will understate the product.

## Priority 0 — Ship billing + quota enforcement

Not an expansion; the prerequisite for everything below. You cannot measure PMF for a paid product until someone can pay.

- Stripe (or Clerk Billing) integration for the two announced tiers.
- Quota gates on generation endpoints. The data model already supports cost-weighted metering; note the `countMonthlyTranscriptGenerations` caveat in DESIGN.md (exclude FAILED / never-completed rows before enforcing).
- A real upgrade wall + pricing page that can take money.
- Effort: weeks, not months. Everything below is downstream of the conversion data this produces.

## Expansion options, ranked

### 1. Podcast support — PMF: strong · ROI: highest of the expansions

Same core transformation (spoken audio → readable, searchable articles) and the same subscription-inbox model, in a market with proven willingness to pay: Snipd and Podwise charge roughly $60–100/yr for shallower output than the existing article pipeline. The expensive part (chunked transcription with validation) is already built. Podcasts are easier than YouTube: open, stable RSS feeds; no Data API quota, scraping arms race, or members-only edge cases (much of DESIGN.md's complexity is YouTube-specific). Audience overlap with the current target user is near-total.

### 2. Creator-side repurposing (sell to YouTubers, not viewers) — PMF: strong · ROI: high

Flip the customer: a YouTuber pays to turn their own channel into a newsletter/blog — SEO pages, Substack-style email to their audience, multi-language articles. Creators treat tools as business expenses (Castmagic, Opus Clip, Repurpose.io sit at ~$30–99/mo); consumers treat $10/mo as a luxury. The pipeline is ~80% of the product; new work is creator onboarding, branded public pages, email delivery. Every creator's public article pages double as an SEO/distribution flywheel for the consumer product. **Strongest pivot-grade option** if consumer willingness-to-pay turns out weak.

### 3. Standalone transcription tool/API — PMF: demonstrated · ROI: moderate-high

E1 proved the demand: transcription-intent searches are the only Google pocket with volume, convert at 13–15% click→signup ($2.88–6.09 each), and were the one segment that activated (27%) and generated transcripts. Most still don't want an inbox. Package the existing engine (works on caption-less videos, 3-hour cap, validated output) as a one-page paste-a-URL tool with metered pricing (per-video or credit packs) and/or a developer API. Low build cost; monetizes a keyword channel already proven buyable. The cheap first test is already queued on the marketing side: the transcript landing page plus first-run paste-a-video path (E2) will show whether this intent activates when the product speaks to it, before any separate tool or API is built. Risk: commodity-adjacent market with thin moats — treat as a cash-flow side product, not the main thesis.

### 4. PKM integrations + annual/lifetime pricing — PMF: moderate · ROI: moderate, cheap

Export highlights/notes to Readwise, Obsidian, Notion; flashcards from summaries. Doesn't open a new market — raises conversion and retention in the existing one, because the PKM crowd (exactly who the Z-track targets) won't adopt a silo. Pair with an annual plan and possibly a one-time AppSumo-style deal for immediate cash.

### 5. Teams / L&D knowledge base — PMF: unproven · ROI: high LTV, slow to validate

"Searchable, readable archive of your org's video" (all-hands, training, conference talks) at $10–20/seat/mo. The search infra is a head start, but this needs a sales motion, SSO/admin, and likely direct video-upload ingestion — months before the first dollar. Only pursue with a design partner in hand; do not build speculatively.

### 6. Any-RSS-source support — PMF: weak · ROI: low

RSS content is already text; the transcribe → summarize → article chain adds nothing to a blog post. This direction becomes a read-it-later/feed reader against Readwise Reader, Feedly, Matter, Inoreader — mature incumbents, brutal free-tier expectations — and dilutes the one real differentiator (making audio/video readable). The defensible version of "more sources" is podcasts (#1). At most, RSS is a retention feature for existing users, not a revenue driver. Note: an RSS-as-second-source plan is open as PR #149 (Aug 22); this ranking argues for parking it behind podcasts.

### 7. Monetize public SEO pages — PMF: n/a · ROI: low now, compounding

Affiliate links (and ads, at volume) on the public reader pages. Passive upside only. Caution: purely AI-restated third-party video content is a thin-content SEO risk and a creator-goodwill gray zone.

## Summary table

| Priority | Move | PMF | ROI |
| --- | --- | --- | --- |
| 0 | Billing + quota enforcement | prerequisite | highest |
| 1 | Podcasts | strong | high (reuses pipeline) |
| 2 | Creator-side repurposing | strong | high (pivot-grade) |
| 3 | Transcription tool/API | demonstrated | moderate-high |
| 4 | PKM integrations + annual pricing | moderate | moderate, cheap |
| 5 | Teams / L&D | unproven | high LTV, slow |
| 6 | Any-RSS sources | weak | low |
| 7 | SEO-page monetization | n/a | low, compounding |

## Recommendation

Don't pivot yet. Fix first-run activation (in progress on the Z track: empty-state paths shipped Sep 4, transcript landing page next), ship billing (Priority 0), then run the existing MARKETING.md experiment framework against **paid conversion** instead of signups. Billing data from a funnel where 15% of signups activate would measure onboarding, not willingness to pay. Podcasts are the natural expansion once even a handful of people pay. Creator-side repurposing is the pivot to reach for if consumer willingness-to-pay proves weak — a call that billing data, not intuition, should make within a month or two of E1-style testing.
