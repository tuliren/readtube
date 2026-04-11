import {
  type EvaluableVideo,
  type Rule,
  type RuleCondition,
  evaluateCondition,
  evaluateRule,
  evaluateRules,
} from '../evaluate';

const baseVideo: EvaluableVideo = {
  title: 'How to build an LLM agent',
  description: 'In this video we walk through building an agent from scratch.',
  channel_id: 'ch_yc',
  channel_name: 'Y Combinator',
};

describe('evaluateCondition', () => {
  it.each<{ cond: RuleCondition; expected: boolean }>([
    { cond: { field: 'title', op: 'contains', value: 'llm' }, expected: true },
    { cond: { field: 'title', op: 'contains', value: 'LLM' }, expected: true },
    { cond: { field: 'title', op: 'contains', value: 'rust' }, expected: false },
    { cond: { field: 'title', op: 'not_contains', value: 'rust' }, expected: true },
    { cond: { field: 'title', op: 'not_contains', value: 'agent' }, expected: false },
    {
      cond: { field: 'title', op: 'equals', value: 'How to build an LLM agent' },
      expected: true,
    },
    { cond: { field: 'title', op: 'equals', value: 'How to build' }, expected: false },
    { cond: { field: 'description', op: 'contains', value: 'scratch' }, expected: true },
    { cond: { field: 'channel_id', op: 'equals', value: 'ch_yc' }, expected: true },
    { cond: { field: 'channel_id', op: 'equals', value: 'ch_other' }, expected: false },
    { cond: { field: 'channel_name', op: 'contains', value: 'combinator' }, expected: true },
    { cond: { field: 'title', op: 'matches', value: '^How' }, expected: true },
    { cond: { field: 'title', op: 'matches', value: '^hello' }, expected: false },
    { cond: { field: 'title', op: 'matches', value: 'agent$' }, expected: true },
    { cond: { field: 'title', op: 'matches', value: '[' }, expected: false }, // bad regex fails closed
  ])('$cond.field $cond.op "$cond.value" -> $expected', ({ cond, expected }) => {
    expect(evaluateCondition(baseVideo, cond)).toBe(expected);
  });
});

describe('evaluateRule', () => {
  it('returns actions when all conditions match (AND)', () => {
    const rule: Rule = {
      id: 'r1',
      enabled: true,
      conditions: [
        { field: 'title', op: 'contains', value: 'llm' },
        { field: 'channel_name', op: 'contains', value: 'combinator' },
      ],
      actions: [{ type: 'star' }],
    };
    expect(evaluateRule(baseVideo, rule)).toEqual([{ type: 'star' }]);
  });

  it('returns empty when any condition fails', () => {
    const rule: Rule = {
      id: 'r1',
      enabled: true,
      conditions: [
        { field: 'title', op: 'contains', value: 'llm' },
        { field: 'title', op: 'contains', value: 'rust' },
      ],
      actions: [{ type: 'star' }],
    };
    expect(evaluateRule(baseVideo, rule)).toEqual([]);
  });

  it('returns empty when disabled', () => {
    const rule: Rule = {
      id: 'r1',
      enabled: false,
      conditions: [{ field: 'title', op: 'contains', value: 'llm' }],
      actions: [{ type: 'star' }],
    };
    expect(evaluateRule(baseVideo, rule)).toEqual([]);
  });

  it('never fires for zero conditions (no wildcard)', () => {
    const rule: Rule = {
      id: 'r1',
      enabled: true,
      conditions: [],
      actions: [{ type: 'archive' }],
    };
    expect(evaluateRule(baseVideo, rule)).toEqual([]);
  });
});

describe('evaluateRules', () => {
  it('aggregates actions from every matching rule', () => {
    const rules: Rule[] = [
      {
        id: 'r1',
        enabled: true,
        conditions: [{ field: 'title', op: 'contains', value: 'llm' }],
        actions: [{ type: 'star' }],
      },
      {
        id: 'r2',
        enabled: true,
        conditions: [{ field: 'channel_name', op: 'contains', value: 'combinator' }],
        actions: [{ type: 'tag', payload: { tagName: 'YC' } }],
      },
      {
        id: 'r3',
        enabled: true,
        conditions: [{ field: 'title', op: 'contains', value: 'rust' }],
        actions: [{ type: 'archive' }],
      },
    ];
    expect(evaluateRules(baseVideo, rules)).toEqual([
      { type: 'star' },
      { type: 'tag', payload: { tagName: 'YC' } },
    ]);
  });
});
