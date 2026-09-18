/** @jest-environment jsdom */
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import type { ChannelConsumption } from '@/lib/channels/consumption';

import ConsumptionMeter from '../ConsumptionMeter';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(consumption: ChannelConsumption) {
  await act(async () => root.render(<ConsumptionMeter consumption={consumption} />));
}

function circles(): SVGCircleElement[] {
  return Array.from(container.querySelectorAll('circle'));
}

/** Consumed fraction the progress arc actually draws, from its dash pattern. */
function arcFraction(): number {
  const arc = circles()[1];
  const [drawn, circumference] = (arc.getAttribute('stroke-dasharray') ?? '')
    .split(' ')
    .map(Number);
  return drawn / circumference;
}

describe('ConsumptionMeter', () => {
  it('draws a single dashed ring when there is too little data to rate', async () => {
    await render({ total: 2, consumed: 2, sinceSubscribed: false });
    expect(circles().length).toBe(1);
    expect(circles()[0].getAttribute('stroke-dasharray')).toBe('2 2.2');
  });

  it.each([
    ['nothing read', 10, 0, 0],
    ['a quarter read', 8, 2, 0.25],
    ['half read', 10, 5, 0.5],
    ['everything read', 10, 10, 1],
  ])('sweeps the arc over %s', async (_label, total, consumed, expected) => {
    await render({ total, consumed, sinceSubscribed: false });
    // A track plus the progress arc drawn over it.
    expect(circles().length).toBe(2);
    expect(arcFraction()).toBeCloseTo(expected);
  });

  it('starts the arc at twelve o_clock', async () => {
    await render({ total: 10, consumed: 5, sinceSubscribed: false });
    expect(circles()[1].getAttribute('transform')).toBe('rotate(-90 7 7)');
  });

  it('keeps the arc lighter on the track than on itself', async () => {
    await render({ total: 10, consumed: 5, sinceSubscribed: false });
    const [track, arc] = circles();
    expect(Number(track.getAttribute('stroke-opacity'))).toBeLessThan(
      Number(arc.getAttribute('stroke-opacity'))
    );
  });

  it.each([
    [
      'a rated channel',
      { total: 10, consumed: 8, sinceSubscribed: false },
      'Often read: you read 8 of 10 videos in the last 90 days',
    ],
    [
      'an unrated channel',
      { total: 1, consumed: 0, sinceSubscribed: false },
      'Not rated yet: only 1 video in the last 90 days, and it takes 3 to rate a channel',
    ],
  ])('explains %s through the label and tooltip', async (_label, consumption, expected) => {
    await render(consumption);
    const meter = container.querySelector('span[role="img"]');
    expect(meter?.getAttribute('aria-label')).toBe(expected);
    expect(meter?.getAttribute('title')).toBe(expected);
  });
});
