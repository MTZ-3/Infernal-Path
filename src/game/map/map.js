export function buildMap() {
// Startdorf → Straße → Dorf → Straße → Dungeon → Straße → Straße → Altar
return [
{ type:'VILLAGE', label:'Startdorf' },
{ type:'ROAD', label:'Straße' },
{ type:'VILLAGE', label:'Dorf' },
{ type:'ROAD', label:'Straße' },
{ type:'DUNGEON', label:'Dungeon' },
{ type:'ROAD', label:'Straße' },
{ type:'ROAD', label:'Straße' },
{ type:'ALTAR', label:'Altar' },
];
}