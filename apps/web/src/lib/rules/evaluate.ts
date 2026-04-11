/**
 * Rule evaluator. Pure functions that take a video + a list of rules and
 * return the set of actions to apply. Actually applying the actions is
 * the caller's job (ingest cron, run-once endpoint) so this module stays
 * testable without any database.
 *
 * Condition model (kept intentionally flat — implicit AND across the
 * conditions array):
 *   { field, op, value }
 *   - field: 'title' | 'description' | 'channel_id' | 'channel_name'
 *   - op:    'contains' | 'equals' | 'matches' | 'not_contains'
 *            'contains' / 'not_contains' are case-insensitive substring checks
 *            'equals' is an exact string match
 *            'matches' is a JavaScript RegExp (value is the pattern source,
 *             flags default to 'i')
 *   - value: string
 *
 * Action model:
 *   { type: 'mark_read' | 'star' | 'save' | 'archive' | 'snooze' | 'tag',
 *     payload?: { snoozeUntilOffsetMs?: number, tagName?: string } }
 *
 * Only flat AND is supported now; OR and nested groups can come later if
 * users ask for them. Keep the shape JSON-serializable so it fits cleanly
 * into the Rule.conditions and Rule.actions JSONB columns.
 */

export type RuleField = 'title' | 'description' | 'channel_id' | 'channel_name';
export type RuleOp = 'contains' | 'not_contains' | 'equals' | 'matches';

export interface RuleCondition {
  field: RuleField;
  op: RuleOp;
  value: string;
}

export type RuleActionType = 'mark_read' | 'star' | 'save' | 'archive' | 'snooze' | 'tag';

export interface RuleAction {
  type: RuleActionType;
  payload?: {
    snoozeUntilOffsetMs?: number;
    tagName?: string;
  };
}

/** Minimal shape the evaluator needs from a video — pick fields from Prisma. */
export interface EvaluableVideo {
  title: string;
  description: string | null;
  channel_id: string;
  channel_name: string;
}

export interface Rule {
  id: string;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

function fieldValue(video: EvaluableVideo, field: RuleField): string {
  switch (field) {
    case 'title':
      return video.title;
    case 'description':
      return video.description ?? '';
    case 'channel_id':
      return video.channel_id;
    case 'channel_name':
      return video.channel_name;
  }
}

/**
 * Evaluate a single condition against a video. Returns true iff the
 * condition matches. Safe for untrusted rule input — regex construction
 * is wrapped in try/catch so a bad pattern fails closed (rule doesn't
 * match) rather than crashing the whole evaluation.
 */
export function evaluateCondition(video: EvaluableVideo, cond: RuleCondition): boolean {
  const haystack = fieldValue(video, cond.field);
  const needle = cond.value;

  switch (cond.op) {
    case 'contains':
      return haystack.toLowerCase().includes(needle.toLowerCase());
    case 'not_contains':
      return !haystack.toLowerCase().includes(needle.toLowerCase());
    case 'equals':
      return haystack === needle;
    case 'matches': {
      try {
        const re = new RegExp(needle, 'i');
        return re.test(haystack);
      } catch {
        return false;
      }
    }
  }
}

/**
 * Run a single rule against a video. All conditions must match (implicit
 * AND) for the rule's actions to fire. Returns the action list, or an
 * empty array if no match.
 */
export function evaluateRule(video: EvaluableVideo, rule: Rule): RuleAction[] {
  if (!rule.enabled) {
    return [];
  }
  if (rule.conditions.length === 0) {
    // A rule with zero conditions is a no-op by design — we don't let
    // users create a wildcard rule that applies to every new video.
    return [];
  }
  const allMatch = rule.conditions.every((c) => evaluateCondition(video, c));
  return allMatch ? rule.actions : [];
}

/**
 * Evaluate every rule against a video and aggregate the actions that
 * should fire. Caller can then dedupe by action type if it wants to
 * suppress duplicates (e.g. two rules both saying 'archive').
 */
export function evaluateRules(video: EvaluableVideo, rules: Rule[]): RuleAction[] {
  return rules.flatMap((r) => evaluateRule(video, r));
}
