import PreviewFrame from './PreviewFrame';

const TRANSCRIPT_LINES = [
  { time: '0:12', text: 'So when we say time has an arrow, what we really mean is entropy.' },
  {
    time: '0:18',
    text: "It's the number of ways you can rearrange a system's microscopic parts without changing how it looks on the outside.",
  },
  { time: '0:27', text: 'A broken egg has vastly more microstates than an intact one.' },
  {
    time: '0:32',
    text: "That's why you never see one spontaneously reassemble, even though nothing in the laws of physics forbids it.",
  },
  { time: '0:41', text: "It's just absurdly, astronomically unlikely." },
  { time: '0:45', text: "The second law isn't a command. It's a statement about statistics." },
];

export default function ReadPreview() {
  return (
    <PreviewFrame>
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Transcript
        </div>
        <div className="flex-1 space-y-1 overflow-hidden text-[10px] leading-relaxed text-slate-600">
          {TRANSCRIPT_LINES.map((line) => (
            <p key={line.time}>
              <span className="mr-1.5 font-mono text-[9px] text-slate-400">[{line.time}]</span>
              {line.text}
            </p>
          ))}
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-indigo-100">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-indigo-600">
            Summary
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-700">
            Time&apos;s arrow is statistical, not fundamental. Entropy is why yesterday feels
            different from tomorrow.
          </p>
        </div>
      </div>
    </PreviewFrame>
  );
}
