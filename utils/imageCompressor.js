const sharp = require('sharp');

const compressProfileImage = async (buffer) => {
  const compressedBuffer = await sharp(buffer)
    .resize(300, 300, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toBuffer();

  return {
    buffer: compressedBuffer,
    contentType: 'image/webp',
    ext: 'webp',
  };
};

module.exports = { compressProfileImage };