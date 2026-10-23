// Birth / government ID verification.
// In production, replace verifyExternalId() with a call to the civil registry / national ID API.
// Here: format check + a simulated registry response so the flow is testable.
const normalize = id => String(id || '').toUpperCase().replace(/\s/g, '');

async function verifyExternalId(rawId) {
  const id = normalize(rawId);
  if (!/^[A-Z0-9-]{6,20}$/.test(id)) return { ok: false, error: 'ID must be 6–20 letters, numbers or dashes.' };
  if (id.startsWith('INVALID')) return { ok: false, error: 'ID not found in the civil registry.' }; // simulated rejection
  return { ok: true, id, verifiedAt: new Date().toISOString(), source: 'SIMULATED-REGISTRY' };
}
module.exports = { verifyExternalId, normalize };
