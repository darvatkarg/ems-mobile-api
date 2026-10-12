const path = require('path');
const fs = require('fs');

/**
 * Returns the primary uploads directory where new files are written.
 * Defaults to voting-mobile-api's own uploads directory on persistent disk,
 * ensuring write permissions and consistency on MilesWeb/cPanel.
 */
function getUploadsDir() {
  let resolvedDir;

  if (process.env.UPLOADS_DIR && process.env.UPLOADS_DIR !== 'uploads') {
    resolvedDir = path.isAbsolute(process.env.UPLOADS_DIR)
      ? process.env.UPLOADS_DIR
      : path.resolve(__dirname, '..', process.env.UPLOADS_DIR);
  } else {
    // Primary: Local service uploads folder (persistent on MilesWeb / cPanel)
    resolvedDir = path.resolve(__dirname, '..', 'uploads');
  }

  if (!fs.existsSync(resolvedDir)) {
    try {
      fs.mkdirSync(resolvedDir, { recursive: true });
    } catch (_) {}
  }

  const profileDir = path.join(resolvedDir, 'profile_pictures');
  if (!fs.existsSync(profileDir)) {
    try {
      fs.mkdirSync(profileDir, { recursive: true });
    } catch (_) {}
  }

  return resolvedDir;
}

/**
 * Returns an array of directories to serve static uploads from.
 * Guarantees that:
 * 1. Local service uploads (where older profile pictures and media reside) are always found.
 * 2. If a custom UPLOADS_DIR is set, it is mounted.
 * 3. If a sibling voting-backend/uploads directory exists, it is checked as a fallback.
 */
function getUploadStaticRoots() {
  const roots = [];
  const primaryDir = getUploadsDir();
  roots.push(primaryDir);

  // Default local uploads directory (if primaryDir is custom)
  const localDir = path.resolve(__dirname, '..', 'uploads');
  if (!roots.includes(localDir) && fs.existsSync(localDir)) {
    roots.push(localDir);
  }

  // Sibling voting-backend/uploads (if deployed side-by-side or monorepo)
  const siblingBackend = path.resolve(__dirname, '..', '..', 'voting-backend', 'uploads');
  if (!roots.includes(siblingBackend) && fs.existsSync(siblingBackend)) {
    roots.push(siblingBackend);
  }

  return roots;
}

module.exports = { getUploadsDir, getUploadStaticRoots };
