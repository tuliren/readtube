export { prisma } from './client';

// Runtime values must be listed explicitly. We can't `export *` from
// @prisma/client because it's CommonJS, which makes Next.js's bundler fall
// back to runtime resolution and emit an `unexpected export *` warning. We
// only need to extend this list when adding a new Prisma enum.
export {
  Prisma,
  PrismaClient,
  ArticleStyle,
  ChannelStatus,
  GenerationStatus,
  UserRequestOutcome,
  UserRequestType,
  UserSourceType,
  VideoPlatformType,
} from '@prisma/client';

// Types are erased at compile time, so `export type *` is invisible to the
// bundler. We get every model type, input type, and namespace type from
// @prisma/client for free without maintaining a list.
export type * from '@prisma/client';
