import '../horario.css';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Empty, PageHead, Segmented, Skeleton, haptic, toast, useLoad } from '../components';
import { Icon } from '../icons';
import { AttendanceCard, Planner, RequestsCard } from './Planner';

type Cls = { id: number; term: string; crn: string; code: string | null; title: string; day: number; start_min: number; end_min: number; room: string | null; building: string | null; start_date: string | null; end_date: string | null };
type Exam = { id: number; course: string | null; title: string; opens_at: number | null; closes_at: number | null };
type Rec = { code: string | null; name: string; credits: number; term: number; why: string };
type Data = { classes: Cls[]; exams: Exam[]; projection: { code: string; title: string }[]; synced_at: number | null; lead: number; recommend: { list: Rec[]; credits: number; note: string } };

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dayIdx = (d: Date) => (d.getDay() + 6) % 7;
const h12 = (m: number) => { const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
const hShort = (m: number) => { const h = Math.floor(m / 60); return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`; };
const dateStr = (sec: number) => { const d = new Date(sec * 1000); return `${DIAS[dayIdx(d)]} ${d.getDate()} ${MESES[d.getMonth()]} · ${h12(d.getHours() * 60 + d.getMinutes())}`; };
/** Color estable por materia, de una paleta curada que combina con el azul de Rumbo. */
const PALETA = [218, 262, 172, 28, 332, 148, 196, 48];
const hue = (title: string) => { let h = 0; for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length]; };
const left = (min: number) => min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + ' min' : ''}`.trim() : `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h`;

/** Una clase ocurre hoy si cae en el día de la semana y dentro de las fechas del trimestre. */
const active = (k: Cls, d: Date) => {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (!k.start_date || iso >= k.start_date) && (!k.end_date || iso <= k.end_date);
};

/** Próxima clase a partir de ahora (hasta 14 días adelante). */
function nextClass(list: Cls[], from = new Date()): { k: Cls; at: Date } | null {
  let best: { k: Cls; at: Date } | null = null;
  for (let add = 0; add < 14; add++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + add);
    for (const k of list) {
      if (k.day !== dayIdx(d) || !active(k, d)) continue;
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, k.start_min);
      if (at <= from) continue;
      if (!best || at < best.at) best = { k, at };
    }
    if (best) return best;
  }
  return best;
}

/** Marcador del navegador: corre dentro de Banner o del DEA (donde ya iniciaste sesión) y manda los datos a Rumbo. */
function bookmarklet(origin: string, codes: string[]) {
  const code = `(async()=>{try{
var O='${origin}',H=location.host,PA=location.pathname,CODES=${JSON.stringify(codes)};
var dec=function(s){var t=document.createElement('textarea');t.innerHTML=s==null?'':String(s);return t.value};
var send=function(o){location.href=O+'/#importar/'+btoa(unescape(encodeURIComponent(JSON.stringify(o))))};
var D=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
if(H.indexOf('bancascade')>-1){
 if(PA.indexOf('P_DispView_Protocols')>-1){var rows=[].slice.call(document.querySelectorAll('table tr')).map(function(tr){return [].slice.call(tr.querySelectorAll('td')).map(function(td){return td.innerText.replace(/\s+/g,' ').trim()})}).filter(function(r){return r.length>=5});
  send({kind:'requests',requests:{rows:rows,empty:/No tiene Solicitudes/i.test(document.body.innerText)}})}
 else send({kind:'account',text:document.body.innerText.slice(0,16000)})}
else if(H.indexOf('banservices')>-1){
 if(PA.indexOf('studentAttendanceTracking')>-1){var at=[].slice.call(document.querySelectorAll('table tbody tr')).map(function(tr){var c=[].slice.call(tr.querySelectorAll('td')).map(function(td){return dec(td.innerText.replace(/\s+/g,' ').trim())});return {term:c[0],crn:c[1],title:c[5],hora:c[7],absences:Number(c[8])||0,pct:parseFloat(c[9])||0}}).filter(function(x){return x.crn});
  if(!at.length){alert('Rumbo: no encontré la lista de asistencia.');return}send({kind:'attendance',attendance:at})}
 else{var tj=await (await fetch('/StudentSelfService/ssb/academicTranscript/academicTranscriptPageData?level=&type=UAPA')).json();var dn=[],cu=[],ic=tj.institutionCredit||{};
 Object.keys(ic).forEach(function(t){ic[t].forEach(function(x){(x.subjectGrid||[]).forEach(function(g){if(g.grade!=null&&g.grade!=='')dn.push({code:g.subjectCode+'-'+g.courseNumber,grade:Number(g.grade),credits:Number(g.creditHours),term:t})})})});
 var cp=tj.courseInProgress||{},ct='';Object.keys(cp).forEach(function(t){ct=t;cp[t].forEach(function(x){(x.subjectGrid||[]).forEach(function(g){cu.push({code:g.subjectCode+'-'+g.courseNumber})})})});
 if(!dn.length&&!cu.length){alert('Rumbo: no encontré histórico.');return}send({kind:'transcript',transcript:{done:dn,current:cu,term:ct}})}}
else if(H.indexOf('pruebas')>-1){var sk=M.cfg.sesskey,now=new Date(),ex={};
 for(var i=-1;i<5;i++){var d=new Date(now.getFullYear(),now.getMonth()+i,1);
 var r=await fetch('/lib/ajax/service.php?sesskey='+sk,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([{index:0,methodname:'core_calendar_get_calendar_monthly_view',args:{year:d.getFullYear(),month:d.getMonth()+1,courseid:1,categoryid:0,includenavigation:false,mini:false}}])});
 var j=(await r.json())[0];if(!j.data)continue;
 j.data.weeks.forEach(function(w){w.days.forEach(function(dy){(dy.events||[]).forEach(function(e){
 var t=e.name.replace(/^Se (abre|cierra) /,'');var k=t+'|'+(e.course&&e.course.shortname);
 ex[k]=ex[k]||{title:t,course:e.course&&e.course.shortname};
 if(e.eventtype=='open')ex[k].opens=e.timestart;if(e.eventtype=='close')ex[k].closes=e.timestart;if(e.eventtype=='due'){ex[k].closes=e.timestart}})})})}
 var L=Object.keys(ex).map(function(k){return ex[k]});
 if(!L.length){alert('Rumbo: no encontré exámenes en el DEA.');return}send({kind:'dea',exams:L})}
else{var f=function(u){return fetch(u).then(function(r){return r.json()})};
 var a=new Date(),s=new Date(a.getFullYear(),a.getMonth()-1,1),e2=new Date(a.getFullYear(),a.getMonth()+4,1);
 var q=function(x){return x.toISOString().slice(0,10)};
 var ev=[];try{ev=await f('/StudentRegistrationSsb/ssb/classRegistration/getRegistrationEvents?termFilter=&startDate='+q(s)+'&endDate='+q(e2))}catch(er){ev=[]}
 var seen={};ev.forEach(function(x){seen[x.crn]=x});var out=[],term='';
 var mt=function(y){var t=y.meetingTime;return{b:t.beginTime,e:t.endTime,d:D.filter(function(n){return t[n]}),sd:t.startDate,ed:t.endDate,room:t.room,bldg:t.building}};
 for(var c in seen){var x=seen[c];term=x.term;
 var m=await f('/StudentRegistrationSsb/ssb/searchResults/getFacultyMeetingTimes?term='+x.term+'&courseReferenceNumber='+x.crn);
 out.push({crn:x.crn,code:x.subject+'-'+x.courseNumber,title:x.title,meetings:(m.fmt||[]).map(mt)})}
 if(!out.length){alert('Rumbo: abre primero «Inscribir asignaturas» (elige el periodo y pulsa Continuar) y vuelve a tocar el marcador.');return}
 var secs=[];
 if(CODES.length){var sid='r'+Date.now().toString(36);
  await fetch('/StudentRegistrationSsb/ssb/term/search?mode=search&term='+term+'&uniqueSessionId='+sid,{method:'POST'});
  for(var ci=0;ci<CODES.length;ci++){var pr=CODES[ci].split('-');
   await fetch('/StudentRegistrationSsb/ssb/classSearch/resetDataForm',{method:'POST'});
   var res=await f('/StudentRegistrationSsb/ssb/searchResults/searchResults?txt_subject='+pr[0]+'&txt_courseNumber='+pr[1]+'&txt_term='+term+'&startDatepicker=&endDatepicker=&uniqueSessionId='+sid+'&pageOffset=0&pageMaxSize=50&sortColumn=subjectDescription&sortDirection=asc');
   (res.data||[]).forEach(function(z){secs.push({crn:z.courseReferenceNumber,code:z.subject+'-'+z.courseNumber,title:dec(z.courseTitle),section:z.sequenceNumber,credits:Number(z.creditHourLow||z.creditHours)||0,seats:z.seatsAvailable,cap:z.maximumEnrollment,campus:dec(z.campusDescription),faculty:(z.faculty||[]).map(function(p){return dec(p.displayName)}).join(', '),meetings:(z.meetingsFaculty||[]).map(mt)})})}}
 send({kind:'schedule',term:term,classes:out,sections:secs})}
}catch(e){alert('Rumbo: '+e.message)}})()`;
  return 'javascript:' + encodeURIComponent(code.replace(/\n/g, ''));
}

/** Si llegaste con #importar/DATOS desde el marcador, guarda y limpia la dirección. */
export function useImportFromHash(onDone: () => void) {
  useEffect(() => {
    const m = location.hash.match(/^#importar\/(.+)$/);
    if (!m) return;
    let body0: { kind?: string } | null = null;
    (async () => {
      try {
        const body = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
        body0 = body;
        const r = await api<{ count: number }>('/uapa/import', { method: 'POST', body });
        toast(body.kind === 'dea' ? `Exámenes del DEA importados (${r.count})` : body.kind === 'transcript' ? `Histórico importado: ${(r as { approved?: number }).approved ?? 0} aprobadas, ${(r as { inCourse?: number }).inCourse ?? 0} en curso` : body.kind === 'attendance' ? `Asistencia importada (${r.count} materias)` : body.kind === 'requests' ? 'Solicitudes importadas' : body.kind === 'account' ? `Estado de cuenta importado: debes RD$${Math.round((r as { balance?: number }).balance ?? 0).toLocaleString('es-DO')}` : `Horario importado (${r.count} bloques y secciones)`); haptic(14);
        onDone();
      } catch (e) { toast((e as Error).message, 'err'); }
      history.replaceState(null, '', body0?.kind === 'account' ? '#pagos' : body0?.kind === 'transcript' ? '#pensum' : '#horario');
    })();
  }, []);
}

function Hero({ data, now }: { data: Data; now: Date }) {
  const today = data.classes.filter((k) => k.day === dayIdx(now) && active(k, now)).sort((a, b) => a.start_min - b.start_min);
  const min = now.getHours() * 60 + now.getMinutes();
  const live = today.find((k) => k.start_min <= min && min < k.end_min);
  const nxt = nextClass(data.classes, now);
  const sameDay = nxt && nxt.at.toDateString() === now.toDateString();
  const k = live || nxt?.k;
  if (!k) return null;
  const mins = live ? live.end_min - min : Math.round((nxt!.at.getTime() - now.getTime()) / 60000);
  return (
    <section className="card" style={{ background: 'var(--night)', color: '#fff' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8FB0FF' }}>{live ? 'En clase ahora' : sameDay ? 'Siguiente clase · hoy' : `Siguiente clase · ${DIAS_LARGO[k.day].toLowerCase()}`}</div>
      <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '6px 0 4px' }}>{k.title}</h3>
      <p style={{ color: '#B8C3EE', fontSize: 14, marginBottom: 14 }}>{live ? `Termina en ${left(mins)}` : `Empieza en ${left(mins)}`} · {h12(k.start_min)} – {h12(k.end_min)} · {(k.building || k.room) ? [k.building, k.room].filter(Boolean).join(' · ') : 'Virtual'}</p>
      <button className="btn b-or" onClick={() => { location.hash = 'apuntes'; }}>Escuchar en vivo</button>
    </section>
  );
}

/** Horario de la semana en cuadrícula, con bloques de color y la línea de «ahora». */
function Timetable({ data, sel, onSel, now }: { data: Data; sel: number; onSel: (d: number) => void; now: Date }) {
  const list = data.classes;
  const lo = Math.min(...list.map((k) => k.start_min), 8 * 60);
  const hi = Math.max(...list.map((k) => k.end_min), 17 * 60);
  const start = Math.floor(lo / 60) * 60, end = Math.ceil(hi / 60) * 60;
  const H = 56, px = (m: number) => ((m - start) / 60) * H, total = ((end - start) / 60) * H;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  const todayI = dayIdx(now), nowMin = now.getHours() * 60 + now.getMinutes();
  const cols = list.some((k) => k.day === 6) ? 7 : 6;
  return (
    <section className="card" style={{ padding: '18px 14px 18px 6px', overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${cols},minmax(74px,1fr))`, minWidth: 52 + cols * 74 }} role="group" aria-label="Semana">
        <div />
        {DIAS.slice(0, cols).map((d, i) => (
          <button key={d} onClick={() => { haptic(6); onSel(i); }} aria-pressed={sel === i} style={{ textAlign: 'center', fontWeight: 700, padding: '0 0 10px', fontSize: 14, color: todayI === i ? 'var(--cobalt)' : 'var(--ink)' }}>
            {d}{todayI === i && <> <span className="chip c-blue" style={{ padding: '1px 8px' }}>hoy</span></>}
          </button>
        ))}
        <div style={{ position: 'relative', height: total, fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>
          {hours.map((h) => <span key={h} style={{ position: 'absolute', top: px(h) - 7, right: 8 }}>{h12(h).replace(':00', '')}</span>)}
        </div>
        {DIAS.slice(0, cols).map((_, i) => (
          <div key={i} className="col-d" style={{ height: total, background: sel === i ? '#F5F8FF' : undefined }}>
            {hours.slice(1, -1).map((h) => <div key={h} className="hl" style={{ top: px(h) }} />)}
            {list.filter((k) => k.day === i).map((k) => {
              const h = hue(k.title), live = todayI === i && nowMin >= k.start_min && nowMin < k.end_min;
              return (
                <div key={k.id} className="blk" style={{ top: px(k.start_min), height: Math.max(34, px(k.end_min) - px(k.start_min) - 2), background: `hsl(${h} 90% 94%)`, borderLeft: `5px solid hsl(${h} 75% 52%)`, boxShadow: live ? `0 0 0 2px hsl(${h} 75% 52%)` : undefined }}>
                  <b>{k.title}</b>{hShort(k.start_min)}–{hShort(k.end_min)}
                </div>
              );
            })}
            {todayI === i && nowMin >= start && nowMin <= end && <div style={{ position: 'absolute', left: 0, right: 0, top: px(nowMin), borderTop: '2px solid var(--orange)' }}><i style={{ position: 'absolute', left: -5, top: -6, width: 10, height: 10, borderRadius: '50%', background: 'var(--orange)' }} /></div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Semana completa de un vistazo: columnas por día y bloques de color donde hay clase. */
export function WeekGrid({ data, sel, onSel, now }: { data: Data; sel: number; onSel: (d: number) => void; now: Date }) {
  const list = data.classes;
  const lo = Math.min(...list.map((k) => k.start_min), 8 * 60);
  const hi = Math.max(...list.map((k) => k.end_min), 17 * 60);
  const start = Math.floor(lo / 60) * 60, end = Math.ceil(hi / 60) * 60, span = end - start;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60).filter((_, i) => i % 2 === 0);
  const todayI = dayIdx(now);
  return (
    <div className="hz-week" role="group" aria-label="Semana">
      <div className="hz-axis" aria-hidden="true">{hours.map((h) => <span key={h} style={{ top: `${((h - start) / span) * 100}%` }}>{hShort(h)}</span>)}</div>
      {DIAS.map((d, i) => (
        <button key={d} className={`hz-col ${sel === i ? 'sel' : ''} ${todayI === i ? 'today' : ''}`} onClick={() => { haptic(6); onSel(i); }} aria-pressed={sel === i} aria-label={DIAS_LARGO[i]}>
          <b>{d}</b>
          <span className="hz-lane">
            {list.filter((k) => k.day === i).map((k) => (
              <i key={k.id} style={{ top: `${((k.start_min - start) / span) * 100}%`, height: `${Math.max(7, ((k.end_min - k.start_min) / span) * 100)}%`, ['--h' as string]: hue(k.title) }} />
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}

function DayAgenda({ data, day, now }: { data: Data; day: number; now: Date }) {
  const list = data.classes.filter((k) => k.day === day).sort((a, b) => a.start_min - b.start_min);
  const isToday = dayIdx(now) === day;
  const min = now.getHours() * 60 + now.getMinutes();
  if (!list.length) return <Empty icon="calendar" title={`${DIAS_LARGO[day]} libre`} text="No tienes clases este día. Buen momento para adelantar tareas." />;
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {list.map((k) => {
        const state = !isToday ? '' : min >= k.end_min ? 'past' : min >= k.start_min ? 'live' : 'next';
        const h = hue(k.title);
        return (
          <li key={k.id} className="agenda" style={{ opacity: state === 'past' ? 0.5 : 1 }}>
            <div className="tm num">{h12(k.start_min)}</div>
            <div className="bl" style={{ background: `hsl(${h} 90% 94%)`, borderLeft: `5px solid hsl(${h} 75% 52%)`, color: '#0B1230' }}>
              <b>{k.title}</b>
              <small style={{ color: '#59638A' }}>{h12(k.start_min)} – {h12(k.end_min)} · {k.building || k.room ? [k.building, k.room].filter(Boolean).join(' · ') : 'Virtual'}{state === 'live' ? ' · AHORA' : ''}</small>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Exams({ data }: { data: Data }) {
  const now = Date.now() / 1000;
  if (!data.exams.length) return <Empty icon="tasks" title="Sin exámenes del DEA" text="Importa el DEA con el marcador de abajo para ver tus pruebas finales y recibir avisos." />;
  return (
    <ul>
      {data.exams.map((e) => {
        const o = e.opens_at, c = e.closes_at;
        const st = o && now < o ? 'soon' : c && now > c ? 'past' : 'open';
        return (
          <li key={e.id} className="row nol">
            <div className="t"><b>{e.title.replace(/^PRUEBA DE EVALUACIÓN FINAL:\s*/i, '')}</b><small>{o ? `Abre ${dateStr(o)}` : ''}{o && c ? ' · ' : ''}{c ? `Cierra ${dateStr(c)}` : ''}</small></div>
            <span className={`chip ${st === 'open' ? 'c-mint' : st === 'soon' ? 'c-orange' : 'c-gray'}`}>{st === 'soon' ? `En ${left(Math.round((o! - now) / 60))}` : st === 'open' ? 'Abierto' : 'Pasó'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function NextTerm({ data }: { data: Data }) {
  const r = data.recommend;
  return (
    <div className="hz-next">
      <div className="hz-next-head">
        <div><small>Te recomiendo para el próximo trimestre</small><b className="num">{r.credits} créditos</b></div>
        <span className="hz-badge">{r.list.length} materias</span>
      </div>
      {r.list.length ? (
        <ul>
          {r.list.map((x) => (
            <li key={(x.code || x.name)} style={{ ['--h' as string]: hue(x.name) }}>
              <i />
              <div><b>{x.name}</b><small>{x.code ? x.code + ' · ' : ''}{x.credits} cr. · {x.why}</small></div>
            </li>
          ))}
        </ul>
      ) : <Empty icon="cap" title="Sin sugerencias todavía" text="Carga tu pensum en la pestaña Pensum y marca lo aprobado para que te recomiende." />}
      {r.note && <p className="hz-note"><Icon name="spark" size={15} />{r.note}</p>}
      {data.projection.length > 0 && (
        <details className="hz-proj"><summary>Proyección oficial de Mi UAPA ({data.projection.length})</summary>
          <ul>{data.projection.map((p) => <li key={p.code}><span className="num">{p.code}</span>{p.title}</li>)}</ul></details>
      )}
    </div>
  );
}

function Importer({ data, reload }: { data: Data; reload: () => void }) {
  const codes = useMemo(() => Array.from(new Set([...data.recommend.list.map((r) => r.code || ''), ...data.projection.map((p) => p.code)])).filter((c) => /^[A-Z]{2,4}-\d{2,4}$/.test(c) && !data.classes.some((k) => k.code === c)).slice(0, 14), [data]);
  const link = useMemo(() => bookmarklet(location.origin, codes), [codes]);
  const [lead, setLead] = useState(data.lead);
  async function saveLead(v: number) { setLead(v); await api('/horario/lead', { method: 'POST', body: { lead: v } }); toast(`Te aviso ${v} min antes`); reload(); }
  const ago = data.synced_at ? Math.max(1, Math.round((Date.now() / 1000 - data.synced_at) / 3600)) : 0;
  return (
    <div className="hz-import">
      <div className="hz-lead">
        <span><Icon name="bell" size={16} />Avisarme antes de cada clase</span>
        <div>{[15, 30, 45, 60].map((v) => <button key={v} className={lead === v ? 'on' : ''} onClick={() => saveLead(v)}>{v} min</button>)}</div>
      </div>
      <details>
        <summary><Icon name="refresh" size={16} />Actualizar desde Mi UAPA y el DEA{ago ? <small>· hace {ago} h</small> : null}</summary>
        <ol>
          <li>En tu computadora, arrastra este botón a la barra de marcadores: <a className="hz-bm" href={link} onClick={(e) => { e.preventDefault(); toast('Arrástralo a tu barra de marcadores, no lo toques aquí'); }}>Importar a Rumbo</a></li>
          <li>Entra a <b>Mi UAPA → Inscripción → Inscribir asignaturas</b> (elige el periodo) y toca el marcador.</li>
          <li>Entra al <b>DEA</b> (Plataforma de exámenes) y toca el marcador otra vez.</li>
          <li>Para tus <b>notas finales</b> abre «Histórico académico» y, para <b>lo que debes</b>, «Resumen de cuenta por periodo»: toca el marcador en cada una.</li>
        </ol>
        <p>El marcador corre en tu navegador con tu sesión: Rumbo nunca ve tu clave.</p>
      </details>
    </div>
  );
}


type CalEvent = { id: string; term: string; title: string; from: string; to: string; kind: string; alert?: boolean; note?: string };
const KIND_ICON: Record<string, string> = { pago: 'wallet', docencia: 'cap', tramite: 'tasks', evaluacion: 'tasks', graduacion: 'cap' };
const isoDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = (iso: string) => { const d = isoDate(iso); return `${DIAS[dayIdx(d)]} ${d.getDate()} ${MESES[d.getMonth()]}`; };

/** Calendario académico oficial de Grado: lo que viene, con cuenta regresiva en lo que vence. */
function UapaCalendar() {
  const cal = useLoad(() => api<{ terms: Record<string, string>; events: CalEvent[] }>('/uapa/calendar'));
  if (!cal.data) return <Skeleton rows={2} hero={false} />;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const terms = Object.keys(cal.data.terms);
  const stateOf = (e: CalEvent) => {
    const a = isoDate(e.from), b = isoDate(e.to);
    if (today > b) return { k: 'past', t: 'Pasó' };
    if (today >= a) { const left = Math.round((b.getTime() - today.getTime()) / 86400000); return { k: 'now', t: left === 0 ? 'Último día' : `Quedan ${left} d` }; }
    const days = Math.round((a.getTime() - today.getTime()) / 86400000);
    return { k: 'soon', t: days === 1 ? 'Mañana' : `En ${days} d` };
  };
  return (
    <div className="hz-cal">
      {terms.map((t) => (
        <section key={t}>
          <h3>{cal.data!.terms[t]}</h3>
          <ul>
            {cal.data!.events.filter((e) => e.term === t).map((e) => {
              const st = stateOf(e);
              return (
                <li key={e.id} className={`hz-ev ${st.k}`}>
                  <span className="hz-ev-ic"><Icon name={KIND_ICON[e.kind] || 'calendar'} size={17} /></span>
                  <div><b>{e.title}</b><small>{e.from === e.to ? dayLabel(e.from) : `${dayLabel(e.from)} → ${dayLabel(e.to)}`}{e.note ? ' · ' + e.note : ''}</small></div>
                  <span className="hz-badge">{st.t}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="hz-src">Fuente: calendario académico de Grado de la UAPA (revisado el 25/10/2026). Confirma siempre en uapa.edu.do.</p>
    </div>
  );
}

export function Horario() {
  const data = useLoad(() => api<Data>('/horario'));
  const [tab, setTab] = useState<'semana' | 'examenes' | 'calendario' | 'proximo'>('semana');
  const [now, setNow] = useState(() => new Date());
  const [sel, setSel] = useState(() => dayIdx(new Date()));
  const [picked, setPicked] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  // Si hoy no hay clases, la semana abre en el día de la próxima clase.
  useEffect(() => {
    if (picked || !data.data?.classes.length) return;
    const t = new Date();
    if (!data.data.classes.some((k) => k.day === dayIdx(t))) { const n = nextClass(data.data.classes, t); if (n) setSel(n.k.day); }
  }, [data.data, picked]);
  useImportFromHash(() => data.reload());
  if (data.error) return <div className="error">{data.error}</div>;
  if (!data.data) return <Skeleton rows={2} />;
  const d = data.data;
  const examsOpen = d.exams.filter((e) => !e.closes_at || e.closes_at * 1000 > Date.now()).length;
  const TABS = [{ id: 'semana', label: 'Semana' }, { id: 'examenes', label: `Exámenes${examsOpen ? ` · ${examsOpen}` : ''}` }, { id: 'calendario', label: 'Calendario' }, { id: 'proximo', label: 'Próximo' }] as const;
  return (
    <div className="rbx">
      <header className="top">
        <div><div className="eb">{d.classes[0] ? `Mi UAPA · trimestre ${d.classes[0].term}` : 'Mi UAPA'}</div><h1 tabIndex={-1}>Horario</h1></div>
        <div className="sp" />
        <div className="seg" role="tablist" aria-label="Horario">
          {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { haptic(5); setTab(t.id); }}>{t.label}</button>)}
        </div>
      </header>
      {!d.classes.length && <div className="card"><Empty icon="calendar" title="Aún no tienes tu horario aquí" text="Impórtalo desde Mi UAPA con el marcador (abajo) y Rumbo te avisará antes de cada clase." /></div>}
      {tab === 'semana' && d.classes.length > 0 && (
        <div className="grid2" style={{ gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,1fr)' }}>
          <div className="col">
            <Timetable data={d} sel={sel} onSel={(i) => { setPicked(true); setSel(i); }} now={now} />
            <section className="card">
              <div className="head"><h3>{DIAS_LARGO[sel]}{dayIdx(now) === sel ? ' · hoy' : ''}</h3></div>
              <DayAgenda data={d} day={sel} now={now} />
            </section>
          </div>
          <div className="col">
            <Hero data={d} now={now} />
            <section className="card">
              <div className="head"><h3>Exámenes del DEA</h3>{examsOpen > 0 && <span className="chip c-orange">{examsOpen} próximos</span>}</div>
              <Exams data={d} />
            </section>
            <section className="card" style={{ background: 'var(--cobaltsoft)' }}>
              <h3 style={{ color: '#1A3FD1' }}>Antes de cada clase</h3>
              <p className="sm" style={{ marginTop: 6, color: 'var(--ink2)' }}>Rumbo te avisa {d.lead} minutos antes y te recuerda qué viste la última vez en esa materia.</p>
            </section>
            <AttendanceCard />
          </div>
        </div>
      )}
      {tab === 'examenes' && <section className="card"><Exams data={d} /></section>}
      {tab === 'calendario' && <><UapaCalendar /><RequestsCard /></>}
      {tab === 'proximo' && <><NextTerm data={d} /><h3 className="hz-day">Planificador de selección</h3><Planner /></>}
      <Importer data={d} reload={data.reload} />
    </div>
  );
}

/** Tarjeta compacta para Inicio: clase en curso o la siguiente, y los exámenes del DEA que vienen. */
export function ClassGlance({ go }: { go: (p: string) => void }) {
  const data = useLoad(() => api<Data>('/horario'));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const d = data.data;
  if (!d || !d.classes.length) return null;
  const min = now.getHours() * 60 + now.getMinutes();
  const live = d.classes.find((k) => k.day === dayIdx(now) && active(k, now) && k.start_min <= min && min < k.end_min);
  const nxt = nextClass(d.classes, now);
  const k = live || nxt?.k;
  if (!k) return null;
  const mins = live ? live.end_min - min : Math.round((nxt!.at.getTime() - now.getTime()) / 60000);
  const exam = d.exams.find((e) => e.opens_at && e.opens_at * 1000 > Date.now());
  return (
    <button className="hz-glance" style={{ ['--h' as string]: hue(k.title) }} onClick={() => go('horario')}>
      <span className="hz-glance-bar" />
      <span className="hz-glance-body">
        <small>{live ? 'En clase ahora' : `Próxima clase · ${nxt!.at.toDateString() === now.toDateString() ? 'hoy' : DIAS_LARGO[k.day].toLowerCase()}`}</small>
        <b>{k.title}</b>
        <em>{h12(k.start_min)} · {k.building || k.room ? [k.building, k.room].filter(Boolean).join(' ') : 'Virtual'}{exam ? ` · Examen ${dateStr(exam.opens_at!)}` : ''}</em>
      </span>
      <span className="hz-glance-t num">{live ? 'termina' : 'en'}<b>{left(mins)}</b></span>
    </button>
  );
}
