'use client';

import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** "Show more" under an onboarding section's grid. */
export default function ShowMoreButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="flex justify-center">
      <Button variant="outline" size="sm" onClick={onClick}>
        <ChevronDown />
        {label}
      </Button>
    </div>
  );
}
