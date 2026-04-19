import { program } from 'commander';

import { fetchKedouBilibiliSubtitle } from '@/lib/platforms/bilibili/kedouSubtitle';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program.requiredOption('--url <value>', 'Bilibili video URL').parse(process.argv);
  const { url } = program.opts<{ url: string }>();

  const result = await fetchKedouBilibiliSubtitle(url);
  console.info(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error('Error:', (err as Error).message);
  process.exit(1);
});
