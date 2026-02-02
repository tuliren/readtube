import { program } from 'commander';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program.option('--param1 <value>', 'Parameter #1', 'defaultValue1').parse(process.argv);
  const options = program.opts();
  const param1 = options.param1;
  console.info('Parameter #1:', param1);
})();
