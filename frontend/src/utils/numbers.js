export const n = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

export const clamp = (x, min=0, max=Infinity) => Math.max(min, Math.min(max, x));

export const toMoney = (x) => {
  const num = Number(x || 0);
  return `Q ${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// permite vacío o número
export const isNumericOrEmpty = (v) =>
  v === '' || v === null || v === undefined || !isNaN(parseFloat(v));

export const totalEfectivoCaja = (c = {}) =>
  200 * n(c.q200) +
  100 * n(c.q100) +
   50 * n(c.q50)  +
   20 * n(c.q20)  +
   10 * n(c.q10)  +
    5 * n(c.q5)   +
    1 * n(c.q1);
