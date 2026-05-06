import { NextRequest } from 'next/server';

import { IMAGES, ImageName, renderImage } from '../../_lib/images';

export const runtime = 'edge';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
): Promise<Response> {
  const { name } = await params;
  if (!(name in IMAGES)) {
    return new Response('Not found', { status: 404 });
  }
  return renderImage(name as ImageName);
}
