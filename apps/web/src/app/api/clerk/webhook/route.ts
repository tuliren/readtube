import type { WebhookEvent } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { Webhook } from 'svix';

import { deleteClerkUser, upsertClerkUser } from '@/lib/db/user';

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CLERK_WEBHOOK_SECRET is not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  const payload = await req.text();
  const wh = new Webhook(secret);

  let event: WebhookEvent;
  try {
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Invalid webhook signature', { status: 400 });
  }

  switch (event.type) {
    case 'user.created':
    case 'user.updated': {
      console.info(`Received Clerk webhook ${event.type} for user ${event.data.id}`);
      try {
        await upsertClerkUser(event.data);
      } catch (err) {
        console.error(`Failed to process user ${event.data.id}:`, err);
        return new Response('Failed to process user', { status: 500 });
      }
      return new Response('Webhook received', { status: 200 });
    }
    case 'user.deleted': {
      const { id } = event.data;
      if (!id) {
        console.warn('Received user.deleted with no user id, ignoring');
        return new Response('Webhook received', { status: 200 });
      }
      console.info(`Received Clerk webhook user.deleted for user ${id}`);
      try {
        await deleteClerkUser(id);
      } catch (err) {
        console.error(`Failed to delete user ${id}:`, err);
        return new Response('Failed to delete user', { status: 500 });
      }
      return new Response('Webhook received', { status: 200 });
    }
    default: {
      return new Response('Event ignored', { status: 200 });
    }
  }
}
