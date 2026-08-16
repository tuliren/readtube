---
name: marketing-operate
description: Run one operating cycle of the ReadTube marketing plan — pull fresh attribution and ad-platform data, apply the kill/iterate/scale rules, then carry the experiments forward (launch planned ones, adjust or stop live ones, advance the zero-dollar track), updating the diaries and budget ledger. Run every 3–4 days while an experiment is live, or on demand.
---

# Marketing operating cycle

You are the operator of the marketing plan in `MARKETING.md` (repo root). It is the
source of truth for budget state, UTM conventions, and decision rules; per-experiment
history lives in `marketing/diary/` (one file per experiment, named after its
`utm_campaign` id, following `marketing/diary/TEMPLATE.md`). Execute one full cycle:
observe → decide → **act** → record.

## Approval gates

The only hard gates are money and identity:

- **Needs explicit owner approval in this session:** starting any new spend (launching
  a campaign, raising a budget/cap, extending campaign dates, buying a sponsorship)
  and anything published under a human identity (Product Hunt, Show HN, community
  posts, outreach emails).
- **Do autonomously:** everything that stops or contains spend (pausing a losing ad or
  campaign per the decision rules), creative/copy preparation, analysis, diary/ledger
  updates, and zero-dollar code work (SEO pages, funnel improvements) shipped as PRs.
- If an action needs approval and the owner is not present in the session, prepare it
  fully (creatives written, campaign configured but paused, links tagged) and list it
  under "Pending owner approval" in the report — never block the rest of the cycle.

## The cycle

1. **Load state.** Read `MARKETING.md` and every file in `marketing/diary/`. Identify
   experiments by status: `live`/`iterating` need review and possibly action; `planned`
   may be ready to launch.

2. **Collect data.**
   - Attribution report, from `apps/web/`:
     `echo Y | yarn script:prod scripts/reportSignupAttribution.ts --days 30`
     and for live campaigns also `--group-by term` (per keyword) and
     `--group-by content` (per creative); `--group-by landing` shows which organic
     pages convert. The script is read-only; the piped `Y` answers the
     production-script confirmation. If `.env.production` is missing in `apps/web/`,
     ask the owner to provide it — do not fall back to the dev database.
   - Ad-platform metrics for live campaigns (spend, impressions, clicks, CPC, ad
     approval status, per-keyword breakdown): browse ads.google.com via the owner's
     logged-in browser (claude-in-chrome). The ReadTube campaigns live in the shared
     Google Ads account 888-925-2284 as their own campaigns — never touch the other
     campaigns in that account. If the browser is unavailable, ask the owner to paste
     the numbers.
   - Watch for Google's "Confirm it's you" identity check — it silently blocks all
     writes ("Changes failed to save") until the owner completes it. If it appears,
     hand it to the owner before making changes, and re-verify afterwards that every
     edit actually persisted (check the live tables, not the editor state).

3. **Decide.** Apply each live experiment's own decision rule (recorded in its diary)
   using cost per signup and the activation rate of attributed signups (activated =
   subscribed a channel or added a video; the report shows signups → activated →
   consumed). There is no revenue metric yet — paid tiers are not purchasable.

4. **Act** — carry each experiment forward per its decision:
   - **Launch** a `planned` experiment whose prerequisites are met: write the
     creatives, build the UTM-tagged links per MARKETING.md conventions (ads always
     land on www.read.tube), configure the campaign via the owner's browser, get
     spend approval (gate above), enable it, and flip the diary to `live` with the
     final Setup recorded. Build campaigns through the post-publish editors
     (campaign shell first, then ad groups/keywords/ads), verifying each entity in
     the live tables — the new-campaign draft wizard has silently dropped ad-group
     entities before.
   - **Kill**: pause the campaign/ads in the platform (no approval needed — this
     stops spend), set status `killed`, write Findings and Outcome.
   - **Iterate**: prepare and swap in new creatives/keywords within the existing
     approved cap; record what changed and why.
   - **Scale**: prepare the budget increase and get approval before applying; then
     update the cap in the diary and ledger. Note the account's spend-$500-get-$500
     credit deadline (Oct 13, 2026) when pacing.
   - **Idle cycles**: if no paid experiment needs action (e.g. waiting on data or
     approvals), advance the zero-dollar track instead — pick the next item from
     MARKETING.md (Product Hunt launch prep, SEO comparison pages, funnel work) and
     ship it as a PR — so every cycle produces forward progress.

5. **Record.** Append a dated entry to each touched experiment's diary (data,
   analysis, decision, actions taken, approvals received or pending); update its
   Status and Budget lines; update the budget ledger in `MARKETING.md`. Move concluded
   experiments' final numbers into their Outcome section.

6. **Report to the owner.** Per experiment: spend vs cap, signups/activated/consumed,
   cost per signup, the decision, the actions taken this cycle, and a "Pending owner
   approval" list. Offer to commit the diary/ledger updates and open a PR (use the
   `create-pr` skill conventions).
