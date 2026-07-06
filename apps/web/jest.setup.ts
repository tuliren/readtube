// Guarantee analytics emission is off during tests regardless of the
// host environment: the emitter fires only on production/preview
// `VERCEL_ENV`, so a machine that happens to export it must not turn
// real event sends on inside the suite.
delete process.env.VERCEL_ENV;
