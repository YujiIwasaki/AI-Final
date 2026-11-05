export const km = (m: number) => `${(m / 1000).toFixed(1)} km`;

export const yen = (y: number) => `${y.toLocaleString('ja-JP')} 円`;

export const dateJa = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}（${w}）`;
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 車ごとの色（色覚の違いでも区別しやすい順） */
export const CAR_COLORS = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00', '#56b4e9', '#7a5195', '#8c564b', '#3b3b98', '#b8860b'];

export const carColor = (i: number) => CAR_COLORS[i % CAR_COLORS.length];

export const byLabel = <T extends { label: string }>(a: T, b: T) => a.label.localeCompare(b.label, 'ja');
