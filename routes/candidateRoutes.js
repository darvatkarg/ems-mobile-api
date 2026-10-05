async function candidateRoutes(fastify, options) {
  fastify.get('/by-booth/:boothId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { boothId } = request.params;

    if (!boothId) {
      return reply.code(400).send({ success: false, message: 'Booth ID parameter is required' });
    }

    try {
      const query = `
        SELECT 
          c.id as candidate_id,
          c.candidate_name,
          p.id as party_id,
          p.party_name,
          p.party_code,
          p.party_icon_url,
          b.id as booth_id,
          b.booth_name,
          b.unique_booth_code,
          w.id as ward_id,
          w.ward_name
        FROM booths b
        JOIN wards w ON b.ward_id = w.id
        JOIN candidates c ON c.ward_id = w.id
        JOIN political_parties p ON c.party_id = p.id
        WHERE b.id = $1
        ORDER BY p.party_name ASC;
      `;

      const result = await fastify.pg.query(query, [boothId]);
      return reply.send({ success: true, candidates: result.rows });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, message: `Server error: ${err.message}` });
    }
  });
}

module.exports = candidateRoutes;