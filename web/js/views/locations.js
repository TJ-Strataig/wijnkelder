import { el, clear, toast } from '../util.js';
import { api } from '../api.js';

export async function render(main) {
  main.append(el('h1', { text: 'Rekken & vakken' }),
    el('p', { class: 'muted small', text: 'Beheer formele kelderlocaties. Vrije tekstlocaties van bestaande flessen blijven behouden.' }));
  const area = el('div'); main.append(area); await load(area);
}
async function load(area) {
  clear(area); const d = await api.get('/api/locations'); const form = el('div', { class: 'card form-grid' });
  const name=el('input',{ placeholder:'Nieuwe locatie' }); const add=el('button',{class:'btn gold',type:'button',text:'Toevoegen'});
  add.onclick=async()=>{try{await api.post('/api/locations',{name:name.value});await load(area);}catch(e){toast(e.message,'error');}}; form.append(name,add);
  area.append(form);
  for (const l of d.locations) {
    const card=el('div',{class:'card'}); const rn=el('input',{placeholder:'Nieuw rek'}); const rb=el('button',{class:'btn secondary sm',type:'button',text:'＋ Rek'});
    rb.onclick=async()=>{try{await api.post(`/api/locations/${l.id}/racks`,{name:rn.value});await load(area);}catch(e){toast(e.message,'error');}};
    card.append(el('div',{class:'row between'},el('h3',{text:l.name}),el('div',{class:'row'},rn,rb)));
    for(const r of d.racks.filter(x=>x.location_id===l.id)){const sn=el('input',{placeholder:'Nieuw vak'});const sb=el('button',{class:'btn ghost sm',type:'button',text:'＋ Vak'});sb.onclick=async()=>{try{await api.post(`/api/racks/${r.id}/slots`,{name:sn.value});await load(area);}catch(e){toast(e.message,'error');}};card.append(el('div',{class:'row between small',style:{marginTop:'0.5rem'}},el('span',{text:`↳ ${r.name} (${r.slot_count} vakken)`}),el('div',{class:'row'},sn,sb)));for(const s of d.slots.filter(x=>x.rack_id===r.id))card.append(el('div',{class:'small muted',text:`　└ ${s.name} · ${s.occupancy||0} bezet`}));}
    area.append(card);
  }
  const occ=await api.get('/api/occupancy'); area.append(el('div',{class:'card'},el('h3',{text:'Bezetting'}),...occ.slots.map(s=>el('div',{class:'row between small'},el('span',{text:`${s.location_name} · ${s.rack_name} · ${s.name}`}),el('strong',{text:String(s.occupancy)})))));
  const legacy=await api.get('/api/locations/legacy'); if(legacy.locations.length) area.append(el('div',{class:'card'},el('h3',{text:'Oude vrije tekstlocaties'}),...legacy.locations.map(x=>el('div',{class:'small muted',text:`${x.location} (${x.count})` }))));
}
