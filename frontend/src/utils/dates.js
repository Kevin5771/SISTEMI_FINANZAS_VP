export const todayISO = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,10);
};

export const getTodayLocalISO = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0]; // YYYY-MM-DD
};

export const formatDate = (iso) => {
  const [y, m, d] = (iso || '').split('-');
  return y ? `${d}/${m}/${y}` : '-';
};