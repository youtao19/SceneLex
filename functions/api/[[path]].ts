/**
 * Makes unmigrated API routes fail clearly while Express is still being replaced.
 */
export async function onRequest() {
  return Response.json(
    {
      success: false,
      message: 'API route not migrated to Cloudflare Worker yet',
    },
    {
      status: 501,
    },
  );
}
