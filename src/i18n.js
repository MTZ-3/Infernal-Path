// src/i18n.js
let dict = {};

export async function initI18n() {
  // JSON per fetch laden (funktioniert zuverlässig auf GitHub Pages)
  const res = await fetch('./lang/de.json');
  dict = await res.json();
}

export function t(key, vars = {}) {
  let s = dict[key] ?? key;
  for (const k in vars) s = s.replaceAll(`{{${k}}}`, String(vars[k]));
  return s;
}
