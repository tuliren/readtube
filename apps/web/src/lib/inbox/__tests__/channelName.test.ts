import { displayChannelName } from '../channelName';

describe('displayChannelName', () => {
  it.each<{ input: string; expected: string; desc: string }>([
    { input: 'Fireship', expected: 'Fireship', desc: 'plain name unchanged' },
    { input: '🚀 Fireship', expected: 'Fireship', desc: 'leading emoji + space' },
    { input: '✨Marques Brownlee', expected: 'Marques Brownlee', desc: 'leading emoji no space' },
    { input: '🚀🔥 CoolChannel', expected: 'CoolChannel', desc: 'multiple leading emojis' },
    { input: '👨‍💻 DevChannel', expected: 'DevChannel', desc: 'ZWJ multi-codepoint emoji' },
    { input: '🏳️‍🌈 Pride', expected: 'Pride', desc: 'flag + variation selector + ZWJ' },
    { input: '👍🏽 Thumbs', expected: 'Thumbs', desc: 'emoji with skin tone modifier' },
    { input: 'Foo 🎉 Bar', expected: 'Foo 🎉 Bar', desc: 'mid-string emoji left alone' },
    { input: '🔥🔥🔥', expected: '🔥🔥🔥', desc: 'all-emoji falls back to original' },
    { input: '   Fireship', expected: 'Fireship', desc: 'leading whitespace stripped' },
  ])('$desc', ({ input, expected }) => {
    expect(displayChannelName(input)).toBe(expected);
  });
});
