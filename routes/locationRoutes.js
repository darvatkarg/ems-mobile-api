async function locationRoutes(fastify, options) {
  fastify.get('/all', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    try {
      const query = `
        SELECT 
          s.id as state_id, s.state_name,
          l.id as lga_id, l.lga_name,
          w.id as ward_id, w.ward_name,
          b.id as booth_id, b.booth_name, b.unique_booth_code, b.registered_voters
        FROM states s
        LEFT JOIN lgas l ON s.id = l.state_id
        LEFT JOIN wards w ON l.id = w.lga_id
        LEFT JOIN booths b ON w.id = b.ward_id
        ORDER BY s.state_name, l.lga_name, w.ward_name, b.booth_name;
      `;

      const result = await fastify.pg.query(query);
      return reply.send({ success: true, locations: result.rows });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, message: `Server error: ${err.message}` });
    }
  });
}

module.exports = locationRoutes;