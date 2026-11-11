const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createEmailOpenTrackingPixel(
  baseUrl: string,
  deliveryId: string
): string {
  if (!UUID_PATTERN.test(deliveryId)) {
    throw new Error('A valid delivery ID is required');
  }

  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    throw new Error('The tracking URL must use HTTP or HTTPS');
  }
  const url = new URL(`/api/email/open/${deliveryId}`, base.origin);

  const src = url.toString().replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<img src="${src}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0" />`;
}

export function appendEmailOpenTrackingPixel(
  html: string,
  baseUrl: string,
  deliveryId: string
): string {
  const pixel = createEmailOpenTrackingPixel(baseUrl, deliveryId);
  const closingBodyIndex = html.search(/<\/body\s*>/i);
  if (closingBodyIndex === -1) return `${html}${pixel}`;

  return `${html.slice(0, closingBodyIndex)}${pixel}${html.slice(closingBodyIndex)}`;
}
