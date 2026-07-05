// Guarantee analytics emission is off during tests regardless of the
// host environment: the analytics emitter only fires when `VERCEL_URL`
// is set, so a dev machine that happens to export it must not turn
// real event sends on inside the suite.
delete process.env.VERCEL_URL;
