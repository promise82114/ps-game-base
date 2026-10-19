// Small local SVGs; no icon package, network request or official artwork needed.
const paths = {
  'ps-plus':[['path',{d:'M9 2h6v7h7v6h-7v7H9v-7H2V9h7V2Z',fill:'currentColor',stroke:'none'}],['path',{d:'m12 4-1.5 3h3L12 4Zm-7.5 7v2h2v-2h-2Zm13 0 2 2m0-2-2 2',stroke:'#795916','stroke-width':'.7'}],['circle',{cx:12,cy:18.5,r:1.2,stroke:'#795916','stroke-width':'.7'}]],
  trophy:[['path',{d:'M8 3h8v6a4 4 0 0 1-8 0V3Z'}],['path',{d:'M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v5m-4 3h8m-6-3h4v3h-4z'}]],
  'circle-x':[['circle',{cx:12,cy:12,r:9}],['path',{d:'m9 9 6 6m0-6-6 6'}]],
  bookmark:[['path',{d:'M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z'}]],
};
export function icon(name) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'classification-icon'}))svg.setAttribute(key,value);
  for(const [tag,attributes] of paths[name]||[]){const child=document.createElementNS(svg.namespaceURI,tag);for(const [key,value] of Object.entries(attributes))child.setAttribute(key,value);svg.append(child);}
  return svg;
}
