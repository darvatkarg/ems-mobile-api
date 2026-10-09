require('dotenv').config();
const path = require('path');
const fs = require('fs');
// NOTE FOR MILESWEB HOSTING:
// For Nginx or Apache / cPanel reverse proxies on MilesWeb, manually update your server config:
// - Apache / cPanel (.htaccess): LimitRequestBody 536870912  and  TimeOut 600
// - Nginx: client_max_body_size 512M;  proxy_read_timeout 600s;  proxy_connect_timeout 600s;  proxy_send_timeout 600s;

const fastify = require('fastify')({
  logger: true,
  bodyLimit: 512 * 1024 * 1024, // 512MB payload limit (default is 1MB)
  connectionTimeout: 600000,    // 10 minutes (600,000 ms)
  keepAliveTimeout: 600000,     // 10 minutes (600,000 ms)
});

// 1. Ensure upload storage directories exist on persistent disk
const uploadsDir = path.join(__dirname, 'uploads');
const profileDir = path.join(uploadsDir, 'profile_pictures');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

// 2. Cross-Origin Resource Sharing
fastify.register(require('@fastify/cors'), {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

// 3. Static File Serving (photos, videos, avatars)
fastify.register(require('@fastify/static'), {
  root: uploadsDir,
  prefix: '/uploads/',
});

// 4. Multipart streaming (512MB limit for video proof and high-res tally sheets)
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 512 * 1024 * 1024,  // 512MB per file
    fieldSize: 512 * 1024 * 1024, // 512MB per field
    files: 3,                     // 2 photos + 1 video
  },
});

// Handle empty JSON bodies gracefully without throwing 400 Bad Request
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    if (!body || body.trim() === '') {
      done(null, {});
      return;
    }
    const json = JSON.parse(body);
    done(null, json);
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// 5. PostgreSQL Pool
fastify.register(require('@fastify/postgres'), {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// 6. JWT Authentication
fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET,
});

// 7. Reusable Authentication Decorator
fastify.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    if (err.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      return reply.code(401).send({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }
    return reply.code(403).send({
      success: false,
      code: 'TOKEN_INVALID',
      message: 'Invalid or expired token.',
    });
  }
});

// 8. Register Routes
fastify.register(require('./routes/authRoutes'), { prefix: '/api/auth' });
fastify.register(require('./routes/locationRoutes'), { prefix: '/api/locations' });
fastify.register(require('./routes/candidateRoutes'), { prefix: '/api/candidates' });
fastify.register(require('./routes/operatorRoutes'), { prefix: '/api/operators' });
fastify.register(require('./routes/voteRoutes'), { prefix: '/api/votes' });

// Health Check
fastify.get('/api/health', async () => ({ status: 'online', service: 'voting-mobile-api' }));

// Start Server
const start = async () => {
  try {
    const port = process.env.PORT || 5001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Fastify Mobile API running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();