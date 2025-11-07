export async function loadLang(code='de'){
const res = await fetch(`./lang/${code}.json`); return res.json();
}