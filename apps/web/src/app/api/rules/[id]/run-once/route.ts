import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { applyRuleActions } from '@/lib/rules/apply';
import { type Rule, type RuleAction, type RuleCondition, evaluateRule } from '@/lib/rules/evaluate';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Retroactively apply a rule to every video the caller already has
 * through their subscriptions. Useful immediately after creating a rule
 * so past videos get the same treatment as future ones.
 *
 * Bounded to 2000 videos per call to keep a single request cheap; users
 * with larger inboxes can re-invoke.
 */
export async function POST(_request: Request, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { id } = await params;

  const ruleRow = await prisma.rule.findFirst({
    where: { id, user_id: userId },
    select: {
      id: true,
      enabled: true,
      conditions: true,
      actions: true,
    },
  });
  if (ruleRow == null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rule: Rule = {
    id: ruleRow.id,
    enabled: ruleRow.enabled,
    conditions: (ruleRow.conditions ?? []) as unknown as RuleCondition[],
    actions: (ruleRow.actions ?? []) as unknown as RuleAction[],
  };

  const videos = await prisma.video.findMany({
    where: {
      channel: { subscriptions: { some: { user_id: userId } } },
    },
    select: {
      id: true,
      title: true,
      description: true,
      channel_id: true,
      channel: { select: { name: true } },
    },
    take: 2000,
  });

  let matched = 0;
  for (const v of videos) {
    const actions = evaluateRule(
      {
        title: v.title,
        description: v.description,
        channel_id: v.channel_id,
        channel_name: v.channel.name,
      },
      rule
    );
    if (actions.length > 0) {
      await applyRuleActions(userId, v.id, actions);
      matched += 1;
    }
  }

  return NextResponse.json({ matched });
}
