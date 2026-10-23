// Generic immunization schedule (WHO-style, simplified). Edit to match national policy.
// days = recommended age in days; after GRACE_DAYS more, a missing dose is "overdue".
const GRACE_DAYS = 28;
const SCHEDULE = [
  { code: 'BCG', name: 'BCG', dose: 1, days: 0 },
  { code: 'HEPB0', name: 'Hepatitis B (birth dose)', dose: 1, days: 0 },
  { code: 'OPV0', name: 'Oral polio (OPV)', dose: 0, days: 0 },
  { code: 'PENTA1', name: 'Pentavalent', dose: 1, days: 42 },
  { code: 'OPV1', name: 'Oral polio (OPV)', dose: 1, days: 42 },
  { code: 'PCV1', name: 'Pneumococcal (PCV)', dose: 1, days: 42 },
  { code: 'ROTA1', name: 'Rotavirus', dose: 1, days: 42 },
  { code: 'PENTA2', name: 'Pentavalent', dose: 2, days: 70 },
  { code: 'OPV2', name: 'Oral polio (OPV)', dose: 2, days: 70 },
  { code: 'PCV2', name: 'Pneumococcal (PCV)', dose: 2, days: 70 },
  { code: 'ROTA2', name: 'Rotavirus', dose: 2, days: 70 },
  { code: 'PENTA3', name: 'Pentavalent', dose: 3, days: 98 },
  { code: 'OPV3', name: 'Oral polio (OPV)', dose: 3, days: 98 },
  { code: 'PCV3', name: 'Pneumococcal (PCV)', dose: 3, days: 98 },
  { code: 'IPV', name: 'Inactivated polio (IPV)', dose: 1, days: 98 },
  { code: 'MEASLES1', name: 'Measles / MR', dose: 1, days: 274 },
  { code: 'MEASLES2', name: 'Measles / MR', dose: 2, days: 456 },
];
const DAY = 86400000;
const ageDays = (dob, on = new Date()) => Math.floor((new Date(on) - new Date(dob)) / DAY);
const addDays = (dob, n) => new Date(new Date(dob).getTime() + n * DAY).toISOString().slice(0, 10);

function statusFor(child, today = new Date()) {
  const age = ageDays(child.dob, today);
  return SCHEDULE.map(v => {
    const doses = Array.isArray(child.doses) ? child.doses : [];
    const given = doses.find(d => d.code === v.code && !d.voided);
    let status = 'upcoming';
    if (given) status = 'given';
    else if (age >= v.days + GRACE_DAYS) status = 'overdue';
    else if (age >= v.days) status = 'due';
    return { ...v, dueDate: addDays(child.dob, v.days), status, record: given || null };
  });
}
function summary(child) {
  const s = statusFor(child);
  const n = k => s.filter(x => x.status === k).length;
  return { overdue: n('overdue'), due: n('due'), given: n('given'), total: s.length };
}
module.exports = { SCHEDULE, statusFor, summary, ageDays };
