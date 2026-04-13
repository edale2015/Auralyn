
function SOFA(v) {
  let s = 0;
  if (v.bp < 90) s += 2;
  if (v.o2 < 92) s += 2;
  return s;
}

function CURB65(v) {
  return (v.age > 65 ? 1 : 0) + (v.bp < 90 ? 1 : 0);
}

function HEART(v) {
  return v.chestPain ? 2 : 0;
}

function WELLS(v) {
  return v.hr > 100 ? 2 : 0;
}

module.exports = { SOFA, CURB65, HEART, WELLS };
