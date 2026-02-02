import { MantineProvider } from '@mantine/core';

import '@/styles/globals.css';
import '@/styles/tailwind.css';

export const parameters = {
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};
export const tags = ['autodocs'];

export const decorators = [
  (Story, context) => {
    return (
      <MantineProvider>
        <Story />
      </MantineProvider>
    );
  },
];
