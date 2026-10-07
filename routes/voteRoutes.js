const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');

async function voteRoutes(fastify, options) {
  fastify.post('/submit-votes', async (request, reply) => {
    const client = await fastify.pg.connect();

    try {
      const parts = request.parts();
      const fields = {};
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      const baseUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, '');

      let tallySheetUrl = null;
      let tallySheetUrl2 = null;
      let videoUrl = null;

      for await (const part of parts) {
        if (part.type === 'file') {
          const ext = path.extname(part.filename) || (part.fieldname === 'tally_video' ? '.mp4' : '.jpg');
          const fileName = `${part.fieldname}_${Date.now()}${ext}`;
          const savePath = path.join(uploadsDir, fileName);

          // Stream to local persistent storage (O(1) memory usage)
          await pipeline(part.file, fs.createWriteStream(savePath));

          const fileUrl = `${baseUrl}/uploads/${fileName}`;
          if (part.fieldname === 'tally_sheet') tallySheetUrl = fileUrl;
          if (part.fieldname === 'tally_sheet_2') tallySheetUrl2 = fileUrl;
          if (part.fieldname === 'tally_video') videoUrl = fileUrl;
        } else {
          fields[part.fieldname] = part.value;
        }
      }

      const { operator_id, booth_id, votes } = fields;

      // if (!operator_id || !booth_id || !votes) {
      //   client.release();
      //   return reply.code(400).send({ success: false, message: 'Missing required vote fields' });
      // }
      if (!operator_id || !booth_id) {
        client.release();
        return reply.code(400).send({ success: false, message: 'Missing required vote fields' });
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
      return reply.code(500).send({ success: false, message: `Failed to record votes: ${err.message}` });
    } finally {
      client.release();
    }
  });
}

module.exports = voteRoutes;