import { Waitlist } from '@clerk/nextjs';
import { FC } from 'react';

interface WaitingListProps {}

const WaitingList: FC<WaitingListProps> = ({}) => {
  return (
    <Waitlist
      appearance={{
        layout: {
          termsPageUrl: undefined,
          privacyPageUrl: undefined,
          logoPlacement: 'none',
        },
        elements: {
          cardBox: {
            boxShadow: 'none',
            border: '1px solid #E5E7EB',
          },
          footer: {
            display: 'none',
          },
        },
      }}
    />
  );
};

export default WaitingList;
