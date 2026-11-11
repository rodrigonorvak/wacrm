import { supabaseAdmin } from '@/lib/flows/admin-client';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
  'base64'
);

function pixelResponse(): Response {
  return new Response(TRANSPARENT_GIF, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Content-Length': String(TRANSPARENT_GIF.length),
      'Content-Type': 'image/gif',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return pixelResponse();

  try {
    const { error } = await supabaseAdmin()
      .from('email_campaign_deliveries')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', id)
      .is('opened_at', null);

    if (error) {
      console.error(
        '[email-campaigns/open] open event recording failed:',
        error.message
      );
    }
  } catch (error) {
    console.error(
      '[email-campaigns/open] open event recording failed:',
      error instanceof Error ? error.message : 'Unknown tracking error'
    );
  }

  return pixelResponse();
}
