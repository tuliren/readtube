import { clerkClient } from '@clerk/nextjs/server';
import { program } from 'commander';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

interface SubscriptionSnippet {
  title: string;
  description: string;
  resourceId: { channelId: string };
  publishedAt: string;
  thumbnails?: { default?: { url: string } };
}

interface SubscriptionItem {
  id: string;
  snippet: SubscriptionSnippet;
}

interface SubscriptionsResponse {
  nextPageToken?: string;
  pageInfo: { totalResults: number; resultsPerPage: number };
  items: SubscriptionItem[];
}

/**
 * This function is working. However, it requires the youtube.readonly scope,
 * which has not been added in GCP yet.
 */
async function fetchAllSubscriptions(token: string): Promise<SubscriptionItem[]> {
  const all: SubscriptionItem[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: 'snippet',
      mine: 'true',
      maxResults: '50',
      order: 'alphabetical',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const url = `https://www.googleapis.com/youtube/v3/subscriptions?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.info(`      Response: ${res.status} ${res.statusText}`);

    const body = await res.text();
    if (!res.ok) {
      throw new Error(`YouTube API error ${res.status}: ${body}`);
    }

    const data: SubscriptionsResponse = JSON.parse(body);
    all.push(...data.items);
    pageToken = data.nextPageToken;

    console.info(
      `      Page ${Math.ceil(all.length / 50)}: fetched ${all.length} / ${data.pageInfo.totalResults}`
    );
  } while (pageToken);

  return all;
}

(async () => {
  program.option('--user-id <value>', 'Clerk user ID').parse(process.argv);

  const options = program.opts<{ userId?: string }>();
  const userId = options.userId;

  if (!userId) {
    console.error('Error: --user-id is required.');
    process.exit(1);
  }

  // Step 1: Look up Clerk user
  console.info(`[1/4] Looking up Clerk user: ${userId}`);
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;
  console.info(`      Name : ${[user.firstName, user.lastName].filter(Boolean).join(' ')}`);
  console.info(`      Email: ${email ?? '(none)'}`);

  // Step 2: Fetch OAuth token
  console.info(`[2/4] Fetching Google OAuth token from Clerk...`);
  const tokenResponse = await client.users.getUserOauthAccessToken(userId, 'google');
  const tokens = tokenResponse.data;

  if (!tokens || tokens.length === 0) {
    console.error(
      '      No OAuth token found. Make sure the user has connected their Google account with youtube.readonly scope.'
    );
    process.exit(1);
  }

  const token = tokens[0].token;
  if (!token) {
    console.error('      OAuth token is empty.');
    process.exit(1);
  }
  console.info(`      Token scopes: ${tokens[0].scopes?.join(', ') ?? '(unknown)'}`);
  console.info(`      Token retrieved.`);

  // Step 3: Fetch subscriptions
  console.info(`[3/4] Fetching YouTube subscriptions...`);
  let subscriptions: SubscriptionItem[];
  try {
    subscriptions = await fetchAllSubscriptions(token);
  } catch (err) {
    console.error('      Error:', (err as Error).message);
    process.exit(1);
  }
  console.info(`      Done. ${subscriptions.length} subscriptions found.`);

  // Step 4: Print results
  console.info(`[4/4] Results:\n`);
  for (const sub of subscriptions) {
    const { title, resourceId } = sub.snippet;
    console.info(`  ${title.padEnd(50)} ${resourceId.channelId}`);
  }
})();
