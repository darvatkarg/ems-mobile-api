const path = require('path');
const fs = require('fs');

/**
 * Resolves the shared physical uploads directory.
 * Ensures both voting-mobile-api (which writes files) and voting-backend (which serves them)
 * point to the exact same physical directory on disk.
 *
 * Priority:
 * 1. process.env.UPLOADS_DIR (if explicitly specified and not default 'uploads')
 * 2. Shared sibling directory: ../voting-backend/uploads (if it exists)
 * 3. Local fallback: ../uploads
 */
function getUploadsDir() {
  let resolvedDir;

  if (process.env.UPLOADS_DIR && process.env.UPLOADS_DIR !== 'uploads') {
    resolvedDir = path.isAbsolute(process.env.UPLOADS_DIR)
      ? process.env.UPLOADS_DIR
      : path.resolve(__dirname, '..', process.env.UPLOADS_DIR);
  } else {
    // Sibling backend uploads directory (shared local / VPS structure)
    const backendUploads = path.resolve(__dirname, '..', '..', 'voting-backend', 'uploads');
    if (fs.existsSync(backendUploads)) {
      resolvedDir = backendUploads;
    } else {
      resolvedDir = path.resolve(__dirname, '..', 'uploads');
    }
  }

  if (!fs.existsSync(resolvedDir)) {
    try {
      fs.mkdirSync(resolvedDir, { recursive: true });
    } catch (_) {}
  }

  return resolvedDir;
}

module.exports = { getUploadsDir };
