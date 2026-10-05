const path = require('path');
const fs = require('fs');
const { compressProfileImage } = require('../utils/imageCompressor');

async function operatorRoutes(fastify, options) {
  const profileDir = path.join(__dirname, '..', 'uploads', 'profile_pictures');

  const getBaseUrl = () => {
    return (process.env.APP_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, '');
  };

  const deleteLocalAvatar = (fileUrl) => {
    if (!fileUrl) return;
    try {
      const fileName = path.basename(fileUrl);
      const filePath = path.join(profileDir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      fastify.log.warn(`Could not delete previous avatar: ${err.message}`);
    }
  };

  // PUT /api/operators/profile
  fastify.put('/profile', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const operatorId = request.user.id;
    const parts = request.parts();
    const fields = {};
    let newProfileUrl = null;

    try {
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'profile_picture') {
          // Read buffer into memory for Sharp compression
          const buffer = await part.toBuffer();
          const { buffer: compressedBuffer, ext } = await compressProfileImage(buffer);

          // Delete previous avatar file from disk
          const existingRes = await fastify.pg.query(
            'SELECT profile_picture FROM operators WHERE id = $1',
            [operatorId]
          );
          const oldPicUrl = existingRes.rows[0]?.profile_picture;
          if (oldPicUrl) {
            deleteLocalAvatar(oldPicUrl);
          }

          // Write compressed WebP directly to disk
          const fileName = `operator_${operatorId}_${Date.now()}.${ext}`;
          const filePath = path.join(profileDir, fileName);
          fs.writeFileSync(filePath, compressedBuffer);

          newProfileUrl = `${getBaseUrl()}/uploads/profile_pictures/${fileName}`;
        } else if (part.type !== 'file') {
          fields[part.fieldname] = part.value;
        }
      }

      const fullName = (fields.full_name || '').trim();

      const query = `
        UPDATE operators 
        SET full_name = COALESCE(NULLIF($1, ''), full_name),
            profile_picture = COALESCE($2, profile_picture)
        WHERE id = $3
        RETURNING id, username, full_name, assigned_booth_id, profile_picture;
      `;
      const result = await fastify.pg.query(query, [fullName, newProfileUrl, operatorId]);

      if (result.rows.length === 0) {
        return reply.code(404).send({ success: false, message: 'Operator not found' });
      }

      const updatedOp = result.rows[0];
      return reply.send({
        success: true,
        message: 'Profile updated successfully',
        operator: updatedOp,
        profile_picture: updatedOp.profile_picture,
        profile_picture_url: updatedOp.profile_picture,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, message: `Profile update error: ${err.message}` });
    }
  });

  // DELETE /api/operators/profile/picture
  fastify.delete('/profile/picture', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const operatorId = request.user.id;

    try {
      const existingRes = await fastify.pg.query(
        'SELECT profile_picture FROM operators WHERE id = $1',
        [operatorId]
      );

      if (existingRes.rows.length === 0) {
        return reply.code(404).send({ success: false, message: 'Operator not found' });
      }

      const oldPicUrl = existingRes.rows[0]?.profile_picture;
      if (oldPicUrl) {
        deleteLocalAvatar(oldPicUrl);
      }

      const result = await fastify.pg.query(
        `UPDATE operators SET profile_picture = NULL WHERE id = $1 
         RETURNING id, username, full_name, assigned_booth_id, profile_picture`,
        [operatorId]
      );

      const updatedOp = result.rows[0];
      return reply.send({
        success: true,
        message: 'Profile picture removed successfully',
        operator: updatedOp,
        profile_picture: null,
        profile_picture_url: null,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, message: `Error removing profile picture: ${err.message}` });
    }
  });
}

module.exports = operatorRoutes;