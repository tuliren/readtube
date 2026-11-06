import ChannelAvatar from '@/components/inbox/ChannelAvatar';
import { cn } from '@/lib/utils';

const SIZES = {
  md: { box: 'h-12 w-12 text-lg', px: 96 },
  lg: { box: 'h-16 w-16 text-2xl', px: 128 },
} as const;

/** A channel's round logo, or its initial when it has none. */
export default function OnboardingChannelAvatar({
  name,
  logoUrl,
  size = 'md',
}: {
  name: string;
  logoUrl: string | null;
  size?: keyof typeof SIZES;
}) {
  const { box, px } = SIZES[size];
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground',
        box
      )}
    >
      {logoUrl != null ? (
        <ChannelAvatar url={logoUrl} size={px} cssSize={box} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
