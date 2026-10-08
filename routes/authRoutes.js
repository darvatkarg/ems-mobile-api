const bcrypt = require('bcrypt');

async function authRoutes(fastify, options) {
  fastify.post('/login', async (request, reply) => {
    let { username, password } = request.body || {};

    if (typeof username === 'string') username = username.trim();
    if (typeof password === 'string') password = password.trim();

    if (!username || !password) {
      return reply.code(400).send({ success: false, message: 'Username and password required.' });
    }

    try {
      const result = await fastify.pg.query(
        `SELECT o.id, o.username, o.full_name, o.password_hash, o.assigned_booth_id, o.profile_picture,
                b.booth_name, b.unique_booth_code, w.ward_name, l.lga_name, s.state_name
         FROM operators o
         LEFT JOIN booths b ON o.assigned_booth_id = b.id
         LEFT JOIN wards w ON b.ward_id = w.id
         LEFT JOIN lgas l ON w.lga_id = l.id
         LEFT JOIN states s ON l.state_id = s.id
         WHERE o.username = $1`,
        [username]
      );

      if (result.rows.length === 0) {
        return reply.code(401).send({ success: false, message: 'Invalid operator credentials' });
      }

      const operator = result.rows[0];

      let isMatch = false;
      if (operator.password_hash && (operator.password_hash.startsWith('$2a$') || operator.password_hash.startsWith('$2b$'))) {
        isMatch = await bcrypt.compare(password, operator.password_hash);
      } else {
        isMatch = (password === operator.password_hash);
        if (isMatch) {
          const newHash = await bcrypt.hash(password, 10);
          await fastify.pg.query('UPDATE operators SET password_hash = $1 WHERE id = $2', [newHash, operator.id]);
        }
      }

      if (!isMatch) {
        return reply.code(401).send({ success: false, message: 'Invalid operator credentials' });
      }

      const token = fastify.jwt.sign(
        { id: operator.id, role: 'operator', assigned_booth_id: operator.assigned_booth_id },
        { expiresIn: '24h' }
      );

      delete operator.password_hash;

      return reply.send({
        success: true,
        token,
        operator,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, message: `Server error: ${err.message}` });
    }
  });
}

module.exports = authRoutes;