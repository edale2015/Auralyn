
function dosing(weight) {
  return "Ceftriaxone " + (weight*50) + " mg";
}

function contraindications(v) {
  if (v.allergy) return "Avoid penicillin";
  return "None";
}

module.exports = { dosing, contraindications };
