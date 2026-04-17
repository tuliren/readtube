import { formatReadingTime } from '@/lib/format/wordCount';

interface Props {
  wordCount: number;
  className?: string;
}

export default function ReadingTimeBadge({ wordCount, className }: Props) {
  const label = formatReadingTime(wordCount);
  if (label == null) {
    return null;
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-500 ${className ?? ''}`}
    >
      {label}
    </span>
  );
}
