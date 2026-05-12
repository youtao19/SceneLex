import postgres from 'postgres';

let sql;

function json(data, init) {
  return Response.json(data, init);
}

function getSql(env) {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('HYPERDRIVE binding is not configured');
  }

  if (!sql) {
    // Hyperdrive provides the connection string at runtime; prepared statements
    // are disabled to keep the first Supabase health check driver-neutral.
    sql = postgres(env.HYPERDRIVE.connectionString, { prepare: false });
  }

  return sql;
}

async function handleDatabaseHealth(env) {
  const rows = await getSql(env)`SELECT 1 AS ok`;

  return json({
    success: true,
    message: 'database is reachable',
    data: {
      ok: rows[0]?.ok === 1,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({
        success: true,
        message: 'worker is running',
        data: {
          service: 'scenelex-worker',
        },
      });
    }

    if (url.pathname === '/api/health/db') {
      try {
        return await handleDatabaseHealth(env);
      } catch (error) {
        console.error(error);
        return json(
          {
            success: false,
            message: error instanceof Error ? error.message : 'Database health check failed',
          },
          {
            status: 500,
          },
        );
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return json(
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
