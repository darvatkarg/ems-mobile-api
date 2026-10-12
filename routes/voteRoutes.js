const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const sharp = require('sharp');
const { getUploadsDir } = require('../utils/uploadsConfig');

async function voteRoutes(fastify, options) {
  fastify.post('/submit-votes', async (request, reply) => {
    const client = await fastify.pg.connect();
    const createdFiles = [];

    try {
      const parts = request.parts();
      const fields = {};
      const uploadsDir = getUploadsDir();
      const baseUrl = (process.env.FILE_BASE_URL || process.env.APP_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, '');

      let tallySheetUrl = null;
      let tallySheetUrl2 = null;
      let videoUrl = null;

      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'tally_sheet' || part.fieldname === 'tally_sheet_2') {
            // Compress image using sharp: auto-orient, max 1600x1600, webp 80% quality
            const fileName = `${part.fieldname}_${Date.now()}.webp`;
            const savePath = path.join(uploadsDir, fileName);

            await pipeline(
              part.file,
              sharp()
                .rotate()
                .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 }),
              fs.createWriteStream(savePath)
            );

            createdFiles.push(savePath);

            const fileUrl = `${baseUrl}/uploads/${fileName}`;
            if (part.fieldname === 'tally_sheet') tallySheetUrl = fileUrl;
            if (part.fieldname === 'tally_sheet_2') tallySheetUrl2 = fileUrl;
          } else if (part.fieldname === 'tally_video') {
            // Memory-safe stream directly to disk (O(1) RAM usage, protects server heap on 50MB-500MB videos)
            const ext = path.extname(part.filename || '') || '.mp4';
            const fileName = `tally_video_${Date.now()}${ext}`;
            const savePath = path.join(uploadsDir, fileName);

            await pipeline(part.file, fs.createWriteStream(savePath));
            createdFiles.push(savePath);

            videoUrl = `${baseUrl}/uploads/${fileName}`;
          } else {
            // Drain unexpected file stream to avoid stalling
            const ext = path.extname(part.filename || '') || '.bin';
            const fileName = `${part.fieldname}_${Date.now()}${ext}`;
            const savePath = path.join(uploadsDir, fileName);
            await pipeline(part.file, fs.createWriteStream(savePath));
            createdFiles.push(savePath);
          }
        } else {
          fields[part.fieldname] = part.value;
        }
      }

      const { operator_id, booth_id, votes } = fields;

      if (!operator_id || !booth_id) {
        client.release();
        for (const f of createdFiles) { if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (_) {} }
        return reply.code(400).send({ success: false, message: 'Missing required operator or booth ID' });
      }

      // 2 photos are strictly mandatory; Video is optional
      if (!tallySheetUrl || !tallySheetUrl2) {
        client.release();
        for (const f of createdFiles) { if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (_) {} }
        return reply.code(400).send({ success: false, message: 'Both Photo 1 and Photo 2 are required.' });
      }

      const parsedVotes = typeof votes === 'string' ? JSON.parse(votes) : votes;
      const combinedTallyUrls = JSON.stringify([tallySheetUrl, tallySheetUrl2].filter(Boolean));

      await client.query('BEGIN');

      const recordResult = await client.query(
        `INSERT INTO vote_records (booth_id, operator_id, tally_sheet_url, video_url) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [booth_id, operator_id, combinedTallyUrls, videoUrl]
      );
      const voteRecordId = recordResult.rows[0].id;

      // for (const [candidateId, count] of Object.entries(parsedVotes)) {
      //   const voteCount = parseInt(count, 10) || 0;
      //   if (voteCount >= 0) {
      //     await client.query(
      //       `INSERT INTO vote_details (vote_record_id, candidate_id, vote_count) 
      //        VALUES ($1, $2, $3)`,
      //       [voteRecordId, candidateId, voteCount]
      //     );
      //   }
      // }

      await client.query('COMMIT');
      return reply.send({ success: true, message: 'Votes successfully recorded!' });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err);

      // Clean up newly created files on failure
      for (const filePath of createdFiles) {
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (_) {}
        }
      }

      return reply.code(500).send({ success: false, message: `Failed to record votes: ${err.message}` });
    } finally {
      client.release();
    }
  });
}

module.exports = voteRoutes;