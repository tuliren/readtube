export default {
  // Match staging restrictions when reviewing deployed UI states.
  env: (config) => ({ ...config, NEXT_PUBLIC_VERCEL_ENV: 'preview' }),
  stories: [
    '../src/**/__stories__/**/*.stories.@(js|jsx|ts|tsx)',
    '../src/**/__stories__/**/*.mdx',
  ],
  addons: [
    '@storybook/addon-links',
    '@chromatic-com/storybook',
    '@storybook/addon-docs'
  ],

  framework: {
    name: '@storybook/nextjs',
    options: {},
  },

  core: {
    disableTelemetry: true,
  },

  docs: {},

  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
};
