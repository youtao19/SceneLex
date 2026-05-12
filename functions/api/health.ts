/**
 * Health check for the Cloudflare edge API layer.
 */
export async function onRequestGet() {
  return Response.json({
    success: true,
    message: 'worker is running',
    data: {
      service: 'scenelex-worker',
    },
  });
}
