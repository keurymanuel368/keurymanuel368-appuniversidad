import { useEffect, useRef, useState } from 'react';
import { api, type CareersRes, type Elective, type PensumRow } from '../api';
import { Empty, Modal, PageHead, Ring, Skeleton, haptic, toast, useLoad } from '../components';
import { Icon } from '../icons';

const ORD = ['', 'Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo', 'Octavo', 'Noveno', 'Décimo', 'Décimo primer', 'Décimo segundo', 'Décimo tercer', 'Décimo cuarto', 'Décimo quinto', 'Décimo sexto'];
const termName = (t: number) => `${ORD[t] || t + '.º'} trimestre`;

const EJEMPLO = `[
  {"term": 1, "code": "CBC-105", "name": "Tecnología para el Aprendizaje Virtual", "credits": 3, "status": "en_curso"},
  {"term": 2, "code": "FGI-103", "name": "Lógica Computacional", "credits": 4, "prereqs": "CBM-107"}
]`;

export function Pensum() {
  const rows = useLoad(() => api<PensumRow[]>('/pensum'));
  const careers = useLoad(() => api<CareersRes>('/careers'));
  const [edit, setEdit] = useState<Partial<PensumRow> | null>(null);
  const [importing, setImporting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const list = rows.data || [];
  const career = careers.data?.current || null;
  const approved = new Set(list.filter((r) => r.status === 'aprobada').map((r) => r.code).filter(Boolean));
  const terms = [...new Set(list.map((r) => r.term))].sort((a, b) => a - b);
  const total = list.reduce((a, r) => a + r.credits, 0);
  const done = list.filter((r) => r.status === 'aprobada').reduce((a, r) => a + r.credits, 0);
  const inCourse = list.filter((r) => r.status === 'en_curso').reduce((a, r) => a + r.credits, 0);
  const graded = list.filter((r) => r.status === 'aprobada' && r.grade !== null);
  const idx = graded.length ? Math.round((graded.reduce((a, r) => a + r.grade! * r.credits, 0) / Math.max(1, graded.reduce((a, r) => a + r.credits, 0))) * 10) / 10 : null;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const currentTerm = list.find((r) => r.status === 'en_curso')?.term ?? list.find((r) => r.status === 'pendiente')?.term ?? 1;

  const blocked = (r: PensumRow) => {
    if (r.status !== 'pendiente') return false;
    if (r.prereqs === 'TODAS') return list.some((x) => x.id !== r.id && x.status !== 'aprobada');
    return (r.prereqs || '').split(',').map((x) => x.trim()).filter(Boolean).some((p) => !approved.has(p));
  };

  // En móvil, abre el mapa en el trimestre que estás cursando.
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-term="${currentTerm}"]`);
    if (el && scrollRef.current) scrollRef.current.scrollLeft = el.offsetLeft - 16;
  }, [currentTerm, list.length]);

  const loading = !rows.data && !rows.error;

  return (
    <>
      <PageHead eyebrow={career ? career.name : 'Tu carrera en la UAPA'} title="Mi pensum">
        <button className="btn line" onClick={() => setChoosing(true)} aria-label="Elegir carrera"><Icon name="cap" size={18} /><span className="lbl">{career ? 'Cambiar carrera' : 'Elegir carrera'}</span></button>
        <button className="btn primary" onClick={() => setEdit({ term: terms.at(-1) || 1, status: 'pendiente', credits: 3 })} aria-label="Agregar asignatura"><Icon name="plus" size={18} /><span className="lbl">Asignatura</span></button>
      </PageHead>

      {loading ? <Skeleton hero rows={1} /> : rows.data && list.length === 0 ? (
        <div className="card">
          <Empty icon="cap" title="Elige tu carrera" text="Carga el pensum oficial completo de la UAPA, con todos los trimestres, prerrequisitos y optativas.">
            <button className="btn primary" style={{ marginTop: 10 }} onClick={() => setChoosing(true)}><Icon name="cap" size={18} />Elegir mi carrera</button>
          </Empty>
        </div>
      ) : (
        <>
          <section className="career stagger">
            <div className="career-hero">
              <div className="b1" /><div className="b2" />
              <Ring value={pct} size={112} label="carrera" />
              <div className="career-copy">
                <span className="kicker"><Icon name="cap" size={14} />AVANCE DE LA CARRERA</span>
                <b className="num">{done} <small>/ {total} créditos</small></b>
                <span>{list.filter((r) => r.status === 'aprobada').length} de {list.length} asignaturas aprobadas · cursando {inCourse} créditos · {termName(currentTerm).toLowerCase()}</span>
              </div>
            </div>
            <div className="stat static">
              <span className="stat-ic green"><Icon name="trend" size={18} /></span>
              <span className="value num">{idx ?? '—'}</span>
              <span className="label">Índice acumulado</span>
              <span className="foot good">Necesitas 70 para graduarte</span>
            </div>
          </section>

          <div className="section">
            <div className="legend">
              <span><i className="lg en_curso" />En curso</span>
              <span><i className="lg aprobada" />Aprobada</span>
              <span><i className="lg disponible" />Disponible</span>
              <span><i className="lg bloqueada" />Con prerrequisito</span>
              <span><i className="lg optativa" />Optativa</span>
            </div>
            <div className="pensum" ref={scrollRef}>
              {terms.map((t) => {
                const items = list.filter((r) => r.term === t);
                const ok = items.filter((r) => r.status === 'aprobada').length;
                return (
                  <div key={t} className={`term ${t === currentTerm ? 'now' : ''}`} data-term={t}>
                    <div className="term-h"><b>{termName(t)}</b><span className="num">{ok}/{items.length} · {items.reduce((a, r) => a + r.credits, 0)} cr</span></div>
                    {items.map((r) => {
                      const cls = blocked(r) ? 'bloqueada' : r.status;
                      const isSlot = r.kind === 'optativa' && !r.code;
                      return (
                        <button key={r.id} className={`subj ${cls} ${r.kind === 'optativa' ? 'opt' : ''}`} onClick={() => setEdit(r)}>
                          <span className="k num">{r.code || 'OPTATIVA'} · {r.credits} cr</span>
                          <span className="n">{r.name}</span>
                          <span className="s">
                            {r.status === 'aprobada' ? <><Icon name="check" size={13} style={{ strokeWidth: 3 }} />Aprobada{r.grade !== null ? ' · ' + r.grade : ''}</>
                              : r.status === 'en_curso' ? 'En curso'
                              : isSlot ? 'Toca para elegir'
                              : blocked(r) ? (r.prereqs === 'TODAS' ? 'Requiere todo aprobado' : `Req. ${r.prereqs}`)
                              : r.coreqs ? `Junto con ${r.coreqs}` : 'Disponible'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {career && (career.notes.length > 0 || career.source) && (
            <details className="card requisites">
              <summary><Icon name="alert" size={18} /><b>Requisitos para graduarte</b><Icon name="chevron" size={18} /></summary>
              <ul>{career.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              {career.source && <a className="link-btn" href={career.source} target="_blank" rel="noopener">Ver el pensum oficial (PDF)<Icon name="link" size={15} /></a>}
              {career.version && <span className="small muted">{career.version}</span>}
            </details>
          )}
        </>
      )}
      {rows.error && <div className="error">{rows.error}</div>}

      {choosing && <ChooseCareer data={careers.data} onClose={() => setChoosing(false)} onImport={() => setImporting(true)} onSaved={() => { setChoosing(false); rows.reload(); careers.reload(); }} />}
      {edit && <EditSubject row={edit} electives={career?.electives || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); rows.reload(); }} />}
      {importing && <ImportPensum onClose={() => setImporting(false)} onSaved={() => { setImporting(false); setChoosing(false); rows.reload(); }} />}
    </>
  );
}

function ChooseCareer({ data, onClose, onSaved, onImport }: { data: CareersRes | null; onClose: () => void; onSaved: () => void; onImport: () => void }) {
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const list = (data?.careers || []).filter((c) => fold(c.name).includes(fold(q)));
  const areas = [...new Set(list.map((c) => c.area))];

  async function pick(id: string) {
    setBusy(id); haptic(10);
    try {
      const r = await api<{ count: number; enCurso: number }>('/pensum/career', { method: 'POST', body: { career: id } });
      toast(`Pensum cargado: ${r.count} asignaturas${r.enCurso ? `, ${r.enCurso} en curso` : ''}`);
      onSaved();
    } catch (e) { toast((e as Error).message, 'err'); }
    setBusy('');
  }

  return (
    <Modal title="Elige tu carrera" onClose={onClose}>
      <p className="hint"><Icon name="alert" size={16} />Se carga el pensum oficial de la UAPA. Lo que ya marcaste como aprobado se conserva, y lo que tienes ahora en el EVA queda como «en curso».</p>
      <input className="input" placeholder="Buscar carrera…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar carrera" />
      {!data ? <div className="sk" style={{ height: 200 }} /> : areas.map((area) => (
        <div key={area} className="career-group">
          <span className="label">{area}</span>
          {list.filter((c) => c.area === area).map((c) => (
            <button key={c.id} className={`career-row ${data.current?.id === c.id ? 'on' : ''}`} disabled={!c.available || !!busy} onClick={() => pick(c.id)}>
              <span className="career-name">{c.name}</span>
              {data.current?.id === c.id ? <span className="pill blue">Actual</span> : c.available ? (busy === c.id ? <span className="pill gray">Cargando…</span> : <Icon name="chevron" size={18} />) : <span className="pill gray">Pronto</span>}
            </button>
          ))}
        </div>
      ))}
      <button className="btn line block" onClick={onImport}><Icon name="upload" size={18} />Mi carrera no está: importar pensum</button>
    </Modal>
  );
}

const STATUS = [{ id: 'pendiente', label: 'Pendiente' }, { id: 'en_curso', label: 'En curso' }, { id: 'aprobada', label: 'Aprobada' }];

function EditSubject({ row, electives, onClose, onSaved }: { row: Partial<PensumRow>; electives: Elective[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ term: row.term ?? 1, code: row.code ?? '', name: row.name ?? '', credits: row.credits ?? 3, status: row.status ?? 'pendiente', grade: row.grade ?? '', prereqs: row.prereqs ?? '', coreqs: row.coreqs ?? '', kind: row.kind ?? 'obligatoria' });
  const [err, setErr] = useState('');
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const isOpt = f.kind === 'optativa';
  const blocks = [...new Set(electives.map((e) => e.block))];
  async function save() {
    const body = { ...f, term: Number(f.term), credits: Number(f.credits), grade: f.grade === '' ? null : Number(f.grade), code: f.code || null, prereqs: f.prereqs || null, coreqs: f.coreqs || null };
    try {
      if (row.id) await api(`/pensum/${row.id}`, { method: 'PATCH', body }); else await api('/pensum', { method: 'POST', body });
      toast('Pensum actualizado');
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  }
  async function remove() { if (row.id) { await api(`/pensum/${row.id}`, { method: 'DELETE' }); toast('Asignatura eliminada'); onSaved(); } }
  return (
    <Modal title={row.id ? (isOpt ? 'Optativa' : 'Asignatura') : 'Nueva asignatura'} onClose={onClose}>
      {err && <div className="error">{err}</div>}
      {isOpt && electives.length > 0 && (
        <div className="field">
          <span className="label">Elige la optativa</span>
          {blocks.map((b) => (
            <div key={b} className="career-group">
              <span className="small muted">{b}</span>
              <div className="chips">
                {electives.filter((e) => e.block === b).map((e) => (
                  <button key={e.code} type="button" className={`chip ${f.code === e.code ? 'on' : ''}`} onClick={() => setF((x) => ({ ...x, code: e.code, name: e.name, credits: e.credits }))}>{e.name}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="field"><label htmlFor="p-name">Nombre</label><input id="p-name" className="input lg" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
      <div className="field">
        <span className="label">Estado</span>
        <div className="chips" role="radiogroup" aria-label="Estado">
          {STATUS.map((s) => <button key={s.id} type="button" role="radio" aria-checked={f.status === s.id} className={`chip ${f.status === s.id ? 'on' : ''}`} onClick={() => set('status', s.id)}>{s.label}</button>)}
        </div>
      </div>
      {f.status === 'aprobada' && <div className="field"><label htmlFor="p-gr">Nota final</label><input id="p-gr" className="input num" inputMode="decimal" value={String(f.grade)} onChange={(e) => set('grade', e.target.value.replace(/[^\d.]/g, ''))} /></div>}
      <div className="form-grid three">
        <div className="field"><label htmlFor="p-code">Clave</label><input id="p-code" className="input num" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></div>
        <div className="field"><label htmlFor="p-term">Trimestre</label><input id="p-term" type="number" min={1} inputMode="numeric" className="input num" value={f.term} onChange={(e) => set('term', e.target.value)} /></div>
        <div className="field"><label htmlFor="p-cr">Créditos</label><input id="p-cr" type="number" min={0} inputMode="numeric" className="input num" value={f.credits} onChange={(e) => set('credits', e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="p-pr">Prerrequisitos (claves separadas por coma)</label><input id="p-pr" className="input num" value={f.prereqs} onChange={(e) => set('prereqs', e.target.value.toUpperCase())} placeholder="CBM-107" /></div>
      {f.coreqs && <p className="hint"><Icon name="alert" size={16} />Correquisito: se cursa junto con {f.coreqs}.</p>}
      <div className="modal-actions">
        {row.id && <button className="btn danger" onClick={remove} aria-label="Eliminar"><Icon name="trash" size={18} /><span className="lbl">Eliminar</span></button>}
        <button className="btn line grow-m" onClick={onClose}>Cancelar</button>
        <button className="btn primary grow-m" onClick={save} disabled={!f.name.trim()}>Guardar</button>
      </div>
    </Modal>
  );
}

function ImportPensum({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(EJEMPLO);
  const [err, setErr] = useState('');
  async function save() {
    try {
      const rows = JSON.parse(text);
      await api('/pensum/import', { method: 'POST', body: rows });
      toast('Pensum importado');
      onSaved();
    } catch (e) { setErr(e instanceof SyntaxError ? 'El texto no es un JSON válido.' : (e as Error).message); }
  }
  return (
    <Modal title="Importar pensum" onClose={onClose}>
      <p className="hint"><Icon name="alert" size={16} />Pega la lista en formato JSON (term = número de trimestre). Reemplaza el pensum actual. Consejo: pásale el PDF de tu pensum a Claude y pídele «conviértelo a este formato».</p>
      {err && <div className="error">{err}</div>}
      <textarea className="input num code-area" rows={12} value={text} onChange={(e) => setText(e.target.value)} aria-label="Pensum en JSON" spellCheck={false} />
      <div className="modal-actions"><button className="btn line grow-m" onClick={onClose}>Cancelar</button><button className="btn primary grow-m" onClick={save}>Importar</button></div>
    </Modal>
  );
}
