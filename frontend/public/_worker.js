export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({
        success: true,
        message: 'worker is running',
        data: {
          service: 'scenelex-worker',
        },
      });
    }

    if (url.pathname.startsWith('/api/')) {
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

    return env.ASSETS.fetch(request);
  },
};
