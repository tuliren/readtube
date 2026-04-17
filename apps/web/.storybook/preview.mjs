import '@/styles/globals.css';
import '@/styles/tailwind.css';
import 'katex/dist/katex.min.css';

export const parameters = {
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};
export const tags = ['autodocs'];
