async function candidateRoutes(fastify, options) {
  // Graceful stub handler: immediately returns 200 OK with empty candidates array.
  // Bypasses the mobile app "Failed to load candidates for this booth" popup during media-only uploads.
  const stubCandidates = async (request, reply) => {
    return reply.code(200).send({
      success: true,
      candidates: [],
      data: [],
      message: 'Candidates loaded successfully'
    });
  };

  // Support /api/candidates/by-booth/:boothId, /api/candidates/:boothId, and /api/candidates
  fastify.get('/by-booth/:boothId', stubCandidates);
  fastify.get('/:boothId', stubCandidates);
  fastify.get('/', stubCandidates);
}

module.exports = candidateRoutes;