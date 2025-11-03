const classes = [
{ id: 'ritter', hp: 16, def: 1 },
{ id: 'jaeger', hp: 14, def: 0 },
{ id: 'assassine', hp: 12, def: 0 },
{ id: 'magier', hp: 10, def: 0 },
{ id: 'priester', hp: 12, def: 0 },
];
const elements = ['feuer','eis','schatten','licht','natur','blut'];


export function createHero() {
const c = classes[(Math.random()*classes.length)|0];
const e = elements[(Math.random()*elements.length)|0];
const hp = c.hp;
return {
name: `${capitalize(c.id)} des ${capitalize(e)}`,
classId: c.id,
element: e,
maxHp: hp,
hp,
spec: rollSpec(),
};
}


function rollSpec() {
const specs = [
{ id:'berserk', label:'Unter 50% Leben: doppelter Schaden' },
{ id:'reg3', label:'Alle 3 Runden: 25% Heilung' },
{ id:'curseimmune1', label:'Ignoriert Flüche in Runde 1' },
];
return specs[(Math.random()*specs.length)|0];
}


function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }