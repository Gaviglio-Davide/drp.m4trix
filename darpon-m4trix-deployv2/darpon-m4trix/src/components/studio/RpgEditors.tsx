'use client'

// ============================================================
// darpon.m4trix — V13 RPG EDITORS
// L'hub completo per creare giochi veri, dentro il Game Studio:
//   📖 Storia · 👥 Personaggi · 💬 Dialoghi · 🚶 Percorsi PNG
//   🎒 Oggetti · 🌳 Albero abilità · 🔮 Magie · ⚔ Combattimento
//   🏠 Case entrabili
// Tutto salvato dentro settings.rpg del progetto (autosave DB).
// ============================================================

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { X, Plus, Trash2 } from 'lucide-react'
import type { GameProject, GameScene } from '@/lib/game2d/types'
import {
  emptyRpg, defaultSkills, defaultSpells,
  ROLE_LABEL, RARITY_LABEL, RARITY_COLOR, ITEM_KIND_LABEL, SPELL_KIND_LABEL,
  type RpgRole, type RpgItemKind, type Rarity, type SpellKind,
  type RpgCharacter, type RpgDialogue, type NpcRoute, type RpgItem,
  type SkillNode, type RpgSpell,
} from '@/lib/rpg/types'
import { eid } from '@/lib/game2d/types'

type TabId =
  | 'storia' | 'personaggi' | 'dialoghi' | 'percorsi'
  | 'oggetti' | 'abilita' | 'magie' | 'combattimento' | 'case'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'storia', label: 'Storia', icon: '📖' },
  { id: 'personaggi', label: 'Personaggi', icon: '👥' },
  { id: 'dialoghi', label: 'Dialoghi', icon: '💬' },
  { id: 'percorsi', label: 'Percorsi PNG', icon: '🚶' },
  { id: 'oggetti', label: 'Oggetti & armi', icon: '🎒' },
  { id: 'abilita', label: 'Albero abilità', icon: '🌳' },
  { id: 'magie', label: 'Magie', icon: '🔮' },
  { id: 'combattimento', label: 'Combattimento', icon: '⚔️' },
  { id: 'case', label: 'Case entrabili', icon: '🏠' },
]

type Props = {
  project: GameProject
  mutate: (fn: (p: GameProject) => void) => void
  onClose: () => void
}

export default function RpgEditors({ project, mutate, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('storia')
  const rpg = useMemo(() => project.settings.rpg ?? emptyRpg(), [project.settings.rpg])

  const patchRpg = (fn: (r: NonNullable<GameProject['settings']['rpg']>) => void) => {
    mutate(p => {
      if (!p.settings.rpg) p.settings.rpg = emptyRpg()
      fn(p.settings.rpg)
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#05070f]/97 backdrop-blur">
      {/* barra alta */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <h2 className="neon-title text-lg font-black tracking-wide">HUB RPG — crea un gioco vero</h2>
        <span className="hidden text-xs text-[var(--tx-faint)] sm:inline">
          tutto si salva da solo nel gioco · zero migrazioni
        </span>
        <Button size="sm" variant="outline" className="cp-btn ml-auto" onClick={onClose}>
          <X className="mr-1 h-4 w-4" /> Chiudi
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* colonna tab */}
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-[var(--line)] p-2 md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                tab === t.id
                  ? 'bg-[var(--primary-soft)] font-bold text-[var(--tx)] ring-1 ring-[var(--neon)]'
                  : 'text-[var(--tx-dim)] hover:bg-[var(--panel-hover)]'
              }`}
            >
              <span className="mr-2">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        {/* contenuto */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'storia' && <StoriaTab rpg={rpg} patch={patchRpg} />}
          {tab === 'personaggi' && <PersonaggiTab rpg={rpg} patch={patchRpg} />}
          {tab === 'dialoghi' && <DialoghiTab rpg={rpg} patch={patchRpg} />}
          {tab === 'percorsi' && <PercorsiTab rpg={rpg} patch={patchRpg} project={project} />}
          {tab === 'oggetti' && <OggettiTab rpg={rpg} patch={patchRpg} />}
          {tab === 'abilita' && <AbilitaTab rpg={rpg} patch={patchRpg} />}
          {tab === 'magie' && <MagieTab rpg={rpg} patch={patchRpg} />}
          {tab === 'combattimento' && <CombattimentoTab rpg={rpg} patch={patchRpg} />}
          {tab === 'case' && <CaseTab project={project} mutate={mutate} />}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 1. STORIA
// ============================================================

function StoriaTab({ rpg, patch }: { rpg: NonNullable<GameProject['settings']['rpg']>; patch: (fn: (r: NonNullable<GameProject['settings']['rpg']>) => void) => void }) {
  const story = rpg.story ?? { logline: '', synopsis: '', chapters: [] }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h3 className="text-lg font-bold text-[var(--tx)]">📖 La storia del tuo gioco</h3>
      <p className="text-sm text-[var(--tx-dim)]">
        La storia viene mostrata all&apos;avvio del gioco come introduzione epica.
      </p>
      <div>
        <Label className="text-[var(--tx-dim)]">Logline (una frase che riassume tutto)</Label>
        <Input
          className="mt-1"
          value={story.logline}
          placeholder="Es. Un giovane fabbro deve riaccendere le fiamme dell'ultima città viva."
          onChange={e => patch(r => { r.story = { ...story, logline: e.target.value } })}
        />
      </div>
      <div>
        <Label className="text-[var(--tx-dim)]">Sinossi completa</Label>
        <textarea
          className="mt-1 min-h-40 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--tx)]"
          value={story.synopsis}
          placeholder="Racconta il mondo, il conflitto, cosa deve fare l'eroe..."
          onChange={e => patch(r => { r.story = { ...story, synopsis: e.target.value } })}
        />
      </div>
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-[var(--tx)]">Capitoli</h4>
        <Button size="sm" className="cp-btn" onClick={() => patch(r => {
          const s = r.story ?? { logline: '', synopsis: '', chapters: [] }
          r.story = { ...s, chapters: [...s.chapters, { title: `Capitolo ${s.chapters.length + 1}`, text: '' }] }
        })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi capitolo
        </Button>
      </div>
      {story.chapters.map((ch, i) => (
        <div key={i} className="cp-panel flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <Input
              value={ch.title}
              onChange={e => patch(r => {
                const s = r.story!
                r.story = { ...s, chapters: s.chapters.map((c, j) => j === i ? { ...c, title: e.target.value } : c) }
              })}
              className="h-8 font-semibold"
            />
            <Button size="sm" variant="outline" className="cp-btn text-red-400" onClick={() => patch(r => {
              const s = r.story!
              r.story = { ...s, chapters: s.chapters.filter((_, j) => j !== i) }
            })}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <textarea
            className="min-h-28 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--tx)]"
            value={ch.text}
            placeholder="Cosa succede in questo capitolo?"
            onChange={e => patch(r => {
              const s = r.story!
              r.story = { ...s, chapters: s.chapters.map((c, j) => j === i ? { ...c, text: e.target.value } : c) }
            })}
          />
        </div>
      ))}
    </div>
  )
}

// ============================================================
// 2. PERSONAGGI
// ============================================================

function PersonaggiTab({ rpg, patch }: { rpg: NonNullable<GameProject['settings']['rpg']>; patch: (fn: (r: NonNullable<GameProject['settings']['rpg']>) => void) => void }) {
  const chars = rpg.characters ?? []
  const add = () => patch(r => {
    r.characters = [...(r.characters ?? []), {
      id: eid(), name: `Personaggio ${chars.length + 1}`, role: 'png',
      desc: '', hp: 60, dmg: 8, speed: 1, color: '#4aa3ff',
    } satisfies RpgCharacter]
  })
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[var(--tx)]">👥 Personaggi</h3>
        <Button size="sm" className="cp-btn" onClick={add}><Plus className="mr-1 h-3.5 w-3.5" /> Nuovo personaggio</Button>
      </div>
      <p className="text-sm text-[var(--tx-dim)]">
        I <b>PNG</b> qui creati prendono vita se nell&apos;editor piazzi un&apos;entità <b>NPC</b> con lo stesso
        nome: dialoghi, percorsi e statistiche si collegano automaticamente.
      </p>
      {chars.length === 0 && <div className="cp-panel p-8 text-center text-sm text-[var(--tx-dim)]">Nessun personaggio: creane uno!</div>}
      {chars.map((c, i) => (
        <div key={c.id} className="cp-panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={c.name}
              className="h-9 w-48 font-bold"
              onChange={e => patch(r => { r.characters![i].name = e.target.value })}
            />
            <select
              value={c.role}
              onChange={e => patch(r => { r.characters![i].role = e.target.value as RpgRole })}
              className="h-9 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-sm text-[var(--tx)]"
            >
              {(Object.keys(ROLE_LABEL) as RpgRole[]).map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
            </select>
            <input
              type="color" value={c.color}
              onChange={e => patch(r => { r.characters![i].color = e.target.value })}
              className="h-9 w-10 cursor-pointer rounded border border-[var(--line)] bg-transparent"
              title="Colore del personaggio"
            />
            <Button size="sm" variant="outline" className="cp-btn ml-auto text-red-400" onClick={() => patch(r => {
              const id = r.characters![i].id
              r.characters = r.characters!.filter(x => x.id !== id)
              r.dialogues = (r.dialogues ?? []).filter(d => d.characterId !== id)
              r.routes = (r.routes ?? []).filter(x => x.characterId !== id)
            })}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
          <Input
            value={c.desc}
            placeholder="Descrizione: chi è, cosa vuole, il suo segreto..."
            onChange={e => patch(r => { r.characters![i].desc = e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num label="Vita" v={c.hp} min={1} max={9999} on={v => patch(r => { r.characters![i].hp = v })} />
            <Num label="Danni" v={c.dmg} min={0} max={999} on={v => patch(r => { r.characters![i].dmg = v })} />
            <Num label="Velocità ×" v={c.speed} min={0.3} max={3} step={0.1} on={v => patch(r => { r.characters![i].speed = v })} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// 3. DIALOGHI (albero con scelte)
// ============================================================

function DialoghiTab({ rpg, patch }: { rpg: NonNullable<GameProject['settings']['rpg']>; patch: (fn: (r: NonNullable<GameProject['settings']['rpg']>) => void) => void }) {
  const chars = rpg.characters ?? []
  const dialogues = rpg.dialogues ?? []
  const [sel, setSel] = useState(0)
  const d = dialogues[sel]
  const charOf = (id: string) => chars.find(c => c.id === id)

  const newDialogue = (characterId: string) => patch(r => {
    const node = { id: eid(), text: 'Ciao, viandante. Cosa ti porta qui?', choices: [] }
    r.dialogues = [...(r.dialogues ?? []), {
      id: eid(), characterId, title: `Dialogo — ${charOf(characterId)?.name ?? '?'}`,
      start: node.id, nodes: [node],
    } satisfies RpgDialogue]
  })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h3 className="text-lg font-bold text-[var(--tx)]">💬 Dialoghi con scelte</h3>
      <p className="text-sm text-[var(--tx-dim)]">
        Ogni PNG può avere il suo albero di dialogo: battute, risposte da scegliere ed effetti
        (dare oggetti, iniziare missioni, curare). Si attiva avvicinandosi e premendo <b>E</b> nel gioco.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {chars.length === 0 && <span className="text-sm text-[var(--tx-dim)]">Prima crea qualche personaggio nella scheda Personaggi.</span>}
        {chars.map(c => (
          <button key={c.id} onClick={() => {
            const idx = dialogues.findIndex(x => x.characterId === c.id)
            if (idx >= 0) setSel(idx)
            else { newDialogue(c.id); setSel(dialogues.length) }
          }} className={`cp-chip cursor-pointer ${dialogues.some(x => x.characterId === c.id) ? 'ring-1 ring-[var(--neon)]' : 'opacity-70'}`}>
            💬 {c.name}
          </button>
        ))}
      </div>
      {d && (
        <div className="flex flex-col gap-3">
          <div className="cp-panel flex items-center gap-2 p-3">
            <span className="font-bold text-[var(--tx)]">{charOf(d.characterId)?.name ?? '?'}</span>
            <span className="text-xs text-[var(--tx-faint)]">{d.nodes.length} nodi</span>
            <Button size="sm" variant="outline" className="cp-btn ml-auto" onClick={() => patch(r => {
              const dd = r.dialogues![sel]
              r.dialogues![sel] = { ...dd, nodes: [...dd.nodes, { id: eid(), text: 'Nuova battuta...', choices: [] }] }
            })}><Plus className="mr-1 h-3 w-3" /> Nodo</Button>
          </div>
          {d.nodes.map((n, ni) => (
            <div key={n.id} className={`cp-panel flex flex-col gap-2 p-4 ${d.start === n.id ? 'ring-1 ring-[var(--neon)]' : ''}`}>
              <div className="flex items-center gap-2">
                {d.start === n.id
                  ? <span className="cp-chip text-[10px]">INIZIO</span>
                  : <button className="cp-chip cursor-pointer text-[10px] opacity-60" onClick={() => patch(r => { r.dialogues![sel].start = n.id })}>rendi inizio</button>}
                <Input
                  value={n.text}
                  onChange={e => patch(r => { r.dialogues![sel].nodes[ni].text = e.target.value })}
                  className="h-8"
                />
                {d.nodes.length > 1 && (
                  <Button size="sm" variant="outline" className="cp-btn text-red-400" onClick={() => patch(r => {
                    const dd = r.dialogues![sel]
                    dd.nodes = dd.nodes.filter(x => x.id !== n.id)
                    if (dd.start === n.id) dd.start = dd.nodes[0].id
                  })}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </div>
              {n.choices.map((c, ci) => (
                <div key={c.id} className="ml-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2">
                  <Input
                    value={c.text}
                    placeholder="Risposta del giocatore"
                    className="h-7 w-56"
                    onChange={e => patch(r => { r.dialogues![sel].nodes[ni].choices[ci].text = e.target.value })}
                  />
                  <select
                    value={c.next ?? ''}
                    onChange={e => patch(r => { r.dialogues![sel].nodes[ni].choices[ci].next = e.target.value || null })}
                    className="h-7 rounded border border-[var(--line)] bg-[var(--panel-soft)] px-1 text-xs text-[var(--tx)]"
                  >
                    <option value="">→ chiudi dialogo</option>
                    {d.nodes.map(n2 => <option key={n2.id} value={n2.id}>→ {n2.text.slice(0, 28) || '(vuoto)'}</option>)}
                  </select>
                  <select
                    value={c.action?.kind ?? 'nessuna'}
                    onChange={e => patch(r => {
                      const k = e.target.value
                      r.dialogues![sel].nodes[ni].choices[ci].action =
                        k === 'dai' ? { kind: 'dai', itemId: (r.items ?? [])[0]?.id ?? '' }
                        : k === 'missione' ? { kind: 'missione', questId: 'quest' }
                        : k === 'cura' ? { kind: 'cura' }
                        : { kind: 'nessuna' }
                    })}
                    className="h-7 rounded border border-[var(--line)] bg-[var(--panel-soft)] px-1 text-xs text-[var(--tx)]"
                  >
                    <option value="nessuna">nessun effetto</option>
                    <option value="dai">🎁 dà un oggetto</option>
                    <option value="missione">📜 inizia missione</option>
                    <option value="cura">💚 cura</option>
                  </select>
                  {c.action?.kind === 'dai' && (
                    <select
                      value={c.action.itemId}
                      onChange={e => patch(r => {
                        const a = r.dialogues![sel].nodes[ni].choices[ci].action
                        if (a && a.kind === 'dai') a.itemId = e.target.value
                      })}
                      className="h-7 rounded border border-[var(--line)] bg-[var(--panel-soft)] px-1 text-xs text-[var(--tx)]"
                    >
                      {(rpg.items ?? []).map(it => <option key={it.id} value={it.id}>{it.icon} {it.name}</option>)}
                    </select>
                  )}
                  <button className="cp-chip cursor-pointer text-[10px] text-red-400" onClick={() => patch(r => {
                    r.dialogues![sel].nodes[ni].choices = r.dialogues![sel].nodes[ni].choices.filter(x => x.id !== c.id)
                  })}>✕</button>
                </div>
              ))}
              <div>
                <Button size="sm" variant="outline" className="cp-btn" onClick={() => patch(r => {
                  r.dialogues![sel].nodes[ni].choices = [...n.choices, { id: eid(), text: 'Nuova risposta', next: null, action: { kind: 'nessuna' } }]
                })}><Plus className="mr-1 h-3 w-3" /> Risposta</Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" className="cp-btn w-fit text-red-400" onClick={() => patch(r => {
            const id = r.dialogues![sel].id
            r.dialogues = r.dialogues!.filter(x => x.id !== id)
            setSel(0)
          })}>Elimina dialogo</Button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 4. PERCORSI PNG
// ============================================================

function PercorsiTab({ rpg, patch, project }: { rpg: NonNullable<GameProject['settings']['rpg']>; patch: (fn: (r: NonNullable<GameProject['settings']['rpg']>) => void) => void; project: GameProject }) {
  const chars = (rpg.characters ?? []).filter(c => c.role === 'png' || c.role === 'alleato')
  const routes = rpg.routes ?? []
  const [charId, setCharId] = useState(chars[0]?.id ?? '')
  const [sceneId, setSceneId] = useState(project.startScene)
  const route = routes.find(x => x.characterId === charId && x.sceneId === sceneId)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h3 className="text-lg font-bold text-[var(--tx)]">🚶 Percorsi: i PNG fanno le loro strade</h3>
      <p className="text-sm text-[var(--tx-dim)]">
        Dai a ogni PNG un giro da fare nel mondo: cammineranno da un punto all&apos;altro
        (e se <b>gira in tondo</b> patrulleranno all&apos;infinito). Coordinate in <b>tile</b> della scena.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={charId} onChange={e => setCharId(e.target.value)} className="h-8 rounded border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-sm text-[var(--tx)]">
          {chars.length === 0 && <option value="">— crea PNG/alleati prima —</option>}
          {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={sceneId} onChange={e => setSceneId(e.target.value)} className="h-8 rounded border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-sm text-[var(--tx)]">
          {project.scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {charId && !route && (
          <Button size="sm" className="cp-btn" onClick={() => patch(r => {
            r.routes = [...(r.routes ?? []), { id: eid(), characterId: charId, sceneId, loop: true, speed: 1.6, waypoints: [] } satisfies NpcRoute]
          })}><Plus className="mr-1 h-3.5 w-3.5" /> Crea percorso</Button>
        )}
      </div>
      {route && (
        <div className="cp-panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--tx-dim)]">
            <label className="flex cursor-pointer items-center gap-1">
              <input type="checkbox" checked={route.loop} onChange={e => patch(r => { (r.routes ?? []).find(x => x.id === route.id)!.loop = e.target.checked })} />
              gira in tondo (patrullamento)
            </label>
            <Num label="Velocità tile/s" v={route.speed} min={0.4} max={6} step={0.2} on={v => patch(r => { (r.routes ?? []).find(x => x.id === route.id)!.speed = v })} />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Num label="X tile" v={0} min={0} max={999} on={() => {}} hidden />
            <WaypointAdd onAdd={(x, y) => patch(r => {
              (r.routes ?? []).find(x2 => x2.id === route.id)!.waypoints.push({ x, y })
            })} maxXY={Math.max(project.scenes.find(s => s.id === sceneId)?.w ?? 20, project.scenes.find(s => s.id === sceneId)?.h ?? 20)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {route.waypoints.map((w, wi) => (
              <span key={wi} className="cp-chip cursor-pointer text-xs" title="clic per eliminare"
                onClick={() => patch(r => {
                  const rt = (r.routes ?? []).find(x => x.id === route.id)!
                  rt.waypoints = rt.waypoints.filter((_, j) => j !== wi)
                })}>
                {wi + 1}. ({w.x},{w.y}) ✕
              </span>
            ))}
            {route.waypoints.length === 0 && <span className="text-xs text-[var(--tx-faint)]">Aggiungi almeno 2 punti.</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function WaypointAdd({ onAdd, maxXY }: { onAdd: (x: number, y: number) => void; maxXY: number }) {
  const [x, setX] = useState(2)
  const [y, setY] = useState(2)
  return (
    <div className="flex items-end gap-2">
      <div>
        <Label className="text-[10px] text-[var(--tx-faint)]">X tile</Label>
        <Input type="number" value={x} min={0} max={maxXY} className="h-8 w-20"
          onChange={e => setX(Math.max(0, Math.min(maxXY, Number(e.target.value) || 0)))} />
      </div>
      <div>
        <Label className="text-[10px] text-[var(--tx-faint)]">Y tile</Label>
        <Input type="number" value={y} min={0} max={maxXY} className="h-8 w-20"
          onChange={e => setY(Math.max(0, Math.min(maxXY, Number(e.target.value) || 0)))} />
      </div>
      <Button size="sm" className="cp-btn" onClick={() => { onAdd(x, y); toast.success(`Punto (${x},${y}) aggiunto`) }}>
        <Plus className="mr-1 h-3 w-3" /> Aggiungi punto
      </Button>
    </div>
  )
}

// ============================================================
// 5. OGGETTI
// ============================================================

function OggettiTab({ rpg, patch }: { rpg: NonNullable<GameProject['settings']['rpg']>; patch: (fn: (r: NonNullable<GameProject['settings']['rpg']>) => void) => void }) {
  const items = rpg.items ?? []
  const icons = ['⚔️', '🗡️', '🏹', '🛡️', '🧪', '💎', '📿', '📜', '🗝️', '🍎', '🔥', '❄️']
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[var(--tx)]">🎒 Oggetti, armi e potenziamenti</h3>
        <Button size="sm" className="cp-btn" onClick={() => patch(r => {
          r.items = [...(r.items ?? []), { id: eid(), name: `Oggetto ${items.length + 1}`, kind: 'arma', desc: '', rarity: 'comune', price: 10, icon: '⚔️', dmg: 5 } satisfies RpgItem]
        })}><Plus className="mr-1 h-3.5 w-3.5" /> Nuovo oggetto</Button>
      </div>
      <p className="text-sm text-[var(--tx-dim)]">
        Le armi aumentano i danni dell&apos;eroe, le armature riducono i danni subiti, le pozioni si
        bevono dall&apos;inventario (tasto <b>I</b>). I nemici sconfitti possono lasciarle cadere come bottino!
      </p>
      {items.length === 0 && <div className="cp-panel p-8 text-center text-sm text-[var(--tx-dim)]">Nessun oggetto ancora.</div>}
      {items.map((it, i) => (
        <div key={it.id} className="cp-panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <select value={it.icon} onChange={e => patch(r => { r.items![i].icon = e.target.value })}
              className="h-9 w-16 rounded border border-[var(--line)] bg-[var(--panel-soft)] px-1 text-lg">
              {icons.map(ic => <option key={ic} value={ic}>{ic}</option>)}
            </select>
            <Input value={it.name} className="h-9 w-44 font-bold" onChange={e => patch(r => { r.items![i].name = e.target.value })} />
            <select value={it.kind} onChange={e => patch(r => { r.items![i].kind = e.target.value as RpgItemKind })}
              className="h-9 rounded border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-sm text-[var(--tx)]">
              {(Object.keys(ITEM_KIND_LABEL) as RpgItemKind[]).map(k => <option key={k} value={k}>{ITEM_KIND_LABEL[k]}</option>)}
            </select>
            <select value={it.rarity} onChange={e => patch(r => { r.items![i].rarity = e.target.value as Rarity })}
              className="h-9 rounded border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-sm"
              style={{ color: RARITY_COLOR[it.rarity] }}>
              {(Object.keys(RARITY_LABEL) as Rarity[]).map(k => <option key={k} value={k}>{RARITY_LABEL[k]}</option>)}
            </select>
            <Button size="sm" variant="outline" className="cp-btn ml-auto text-red-400" onClick={() => patch(r => {
              r.items = r.items!.filter(x => x.id !== it.id)
            })}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
          <Input value={it.desc} placeholder="Descrizione dell'oggetto" onChange={e => patch(r => { r.items![i].desc = e.target.value })} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(it.kind === 'arma' || it.kind === 'amuleto') && <Num label="Danni" v={it.dmg ?? 0} min={0} max={999} on={v => patch(r => { r.items![i].dmg = v })} />}
            {(it.kind === 'armatura' || it.kind === 'amuleto') && <Num label="Difesa" v={it.def ?? 0} min={0} max={999} on={v => patch(r => { r.items![i].def = v })} />}
            {it.kind === 'pozione' && <Num label="Cura" v={it.heal ?? 0} min={0} max={999} on={v => patch(r => { r.items![i].heal = v })} />}
            {it.kind === 'pozione' && <Num label="Mana" v={it.mana ?? 0} min={0} max={999} on={v => patch(r => { r.items![i].mana = v })} />}
            <Num label="Prezzo" v={it.price} min={0} max={99999} on={v => patch(r => { r.items![i].price = v })} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// 6. ALBERO ABILITÀ
// ============================================================

function AbilitaTab({ rpg, patch }: { rpg: NonNullable<GameProject['settings']['rpg']>; patch: (fn: (r: NonNullable<GameProject['settings']['rpg']>) => void) => void }) {
  const skills = rpg.skills ?? []
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-[var(--tx)]">🌳 Albero abilità</h3>
        <div className="flex gap-2">
          {skills.length === 0 && (
            <Button size="sm" variant="outline" className="cp-btn" onClick={() => patch(r => { r.skills = defaultSkills() })}>
              ⚡ Carica albero di serie
            </Button>
          )}
          <Button size="sm" className="cp-btn" onClick={() => patch(r => {
            r.skills = [...(r.skills ?? []), { id: eid(), name: `Abilità ${skills.length + 1}`, desc: '', cost: 1, req: [], effect: {}, icon: '✨' } satisfies SkillNode]
          })}><Plus className="mr-1 h-3.5 w-3.5" /> Nuova abilità</Button>
        </div>
      </div>
      <p className="text-sm text-[var(--tx-dim)]">
        I nemici uccisi danno <b>punti abilità</b>: il giocatore li spende qui (tasto <b>TAB</b> in gioco).
        Le abilità con <b>requisiti</b> si sbloccano solo dopo quelle richieste.
      </p>
      {skills.length === 0 && <div className="cp-panel p-8 text-center text-sm text-[var(--tx-dim)]">Albero vuoto: parti da «Carica albero di serie».</div>}
      {skills.map((s, i) => (
        <div key={s.id} className="cp-panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={s.icon} className="h-9 w-14 text-center" onChange={e => patch(r => { r.skills![i].icon = e.target.value })} />
            <Input value={s.name} className="h-9 w-44 font-bold" onChange={e => patch(r => { r.skills![i].name = e.target.value })} />
            <Num label="Costo punti" v={s.cost} min={1} max={5} on={v => patch(r => { r.skills![i].cost = v })} />
            <Button size="sm" variant="outline" className="cp-btn ml-auto text-red-400" onClick={() => patch(r => {
              r.skills = r.skills!.filter(x => x.id !== s.id)
              r.skills.forEach(x => { x.req = x.req.filter(q => q !== s.id) })
            })}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
          <Input value={s.desc} placeholder="Cosa fa questa abilità?" onChange={e => patch(r => { r.skills![i].desc = e.target.value })} />
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-[var(--tx-faint)]">Richiede:</span>
            {skills.filter(x => x.id !== s.id).map(x => (
              <button key={x.id}
                className={`cp-chip cursor-pointer text-[10px] ${s.req.includes(x.id) ? 'ring-1 ring-[var(--neon)]' : 'opacity-60'}`}
                onClick={() => patch(r => {
                  const n = r.skills![i]
                  n.req = n.req.includes(x.id) ? n.req.filter(q => q !== x.id) : [...n.req, x.id]
                })}>
                {x.icon} {x.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num label="+Danni" v={s.effect.dmg ?? 0} min={0} max={99} on={v => patch(r => { r.skills![i].effect.dmg = v })} />
            <Num label="+Vita" v={s.effect.hp ?? 0} min={0} max={999} on={v => patch(r => { r.skills![i].effect.hp = v })} />
            <Num label="+Stamina" v={s.effect.stamina ?? 0} min={0} max={999} on={v => patch(r => { r.skills![i].effect.stamina = v })} />
            <Num label="+Mana" v={s.effect.mana ?? 0} min={0} max={999} on={v => patch(r => { r.skills![i].effect.mana = v })} />
            <Num label="% Velocità" v={s.effect.speed ?? 0} min={0} max={100} on={v => patch(r => { r.skills![i].effect.speed = v })} />
            <Num label="% Critico" v={s.effect.crit ?? 0} min={0} max={100} on={v => patch(r => { r.skills![i].effect.crit = v })} />
            <Num label="Rigenerazione/s" v={s.effect.regen ?? 0} min={0} max={20} on={v => patch(r => { r.skills![i].effect.regen = v })} />
            <label className="flex items-center gap-2 self-end text-xs text-[var(--tx-dim)]">
              <input type="checkbox" checked={!!s.effect.parry} onChange={e => patch(r => { r.skills![i].effect.parry = e.target.checked })} />
              sblocca parata
            </label>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// 7. MAGIE
// ============================================================

function MagieTab({ rpg, patch }: { rpg: NonNullable<GameProject['settings']['rpg']>; patch: (fn: (r: NonNullable<GameProject['settings']['rpg']>) => void) => void }) {
  const spells = rpg.spells ?? []
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-[var(--tx)]">🔮 Magie</h3>
        <div className="flex gap-2">
          {spells.length === 0 && (
            <Button size="sm" variant="outline" className="cp-btn" onClick={() => patch(r => { r.spells = defaultSpells() })}>
              ⚡ Carica 4 magie di serie
            </Button>
          )}
          <Button size="sm" className="cp-btn" onClick={() => patch(r => {
            r.spells = [...(r.spells ?? []), { id: eid(), name: `Magia ${spells.length + 1}`, kind: 'proiettile', mana: 10, dmg: 10, cd: 1.5, color: '#b26bff', icon: '✨' } satisfies RpgSpell]
          })}><Plus className="mr-1 h-3.5 w-3.5" /> Nuova magia</Button>
        </div>
      </div>
      <p className="text-sm text-[var(--tx-dim)]">
        Il giocatore lancia le magie con <b>Q</b> e cambia magia selezionata con <b>1-4</b> o la rotella.
        Ogni magia costa <b>mana</b> e ha una sua ricarica.
      </p>
      {spells.length === 0 && <div className="cp-panel p-8 text-center text-sm text-[var(--tx-dim)]">Nessuna magia ancora.</div>}
      {spells.map((sp, i) => (
        <div key={sp.id} className="cp-panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={sp.icon} className="h-9 w-14 text-center" onChange={e => patch(r => { r.spells![i].icon = e.target.value })} />
            <Input value={sp.name} className="h-9 w-44 font-bold" onChange={e => patch(r => { r.spells![i].name = e.target.value })} />
            <select value={sp.kind} onChange={e => patch(r => { r.spells![i].kind = e.target.value as SpellKind })}
              className="h-9 rounded border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-sm text-[var(--tx)]">
              {(Object.keys(SPELL_KIND_LABEL) as SpellKind[]).map(k => <option key={k} value={k}>{SPELL_KIND_LABEL[k]}</option>)}
            </select>
            <input type="color" value={sp.color} onChange={e => patch(r => { r.spells![i].color = e.target.value })}
              className="h-9 w-10 cursor-pointer rounded border border-[var(--line)] bg-transparent" title="Colore della magia" />
            <Button size="sm" variant="outline" className="cp-btn ml-auto text-red-400" onClick={() => patch(r => {
              r.spells = r.spells!.filter(x => x.id !== sp.id)
            })}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num label="Costo mana" v={sp.mana} min={0} max={200} on={v => patch(r => { r.spells![i].mana = v })} />
            <Num label="Danni" v={sp.dmg ?? 0} min={0} max={999} on={v => patch(r => { r.spells![i].dmg = v })} />
            <Num label="Cura" v={sp.heal ?? 0} min={0} max={999} on={v => patch(r => { r.spells![i].heal = v })} />
            <Num label="Ricarica (s)" v={sp.cd} min={0.2} max={30} step={0.1} on={v => patch(r => { r.spells![i].cd = v })} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// 8. COMBATTIMENTO
// ============================================================

const COMBAT_TOGGLES: { key: 'parry' | 'dodge' | 'sprint' | 'mana' | 'combo' | 'xp'; label: string; desc: string }[] = [
  { key: 'parry', label: '🛡 Parata perfetta', desc: 'F al momento giusto: danni nulli e contrattacco potenziato' },
  { key: 'dodge', label: '🌀 Schivata', desc: 'Shift = volteggio con invulnerabilità breve' },
  { key: 'sprint', label: '🏃 Corsa', desc: 'Shift tiene premuto = corri, consuma stamina' },
  { key: 'mana', label: '🔮 Mana e magie', desc: 'barra mana, lancia magie con Q' },
  { key: 'combo', label: '💥 Combo e critici', desc: 'colpi di fila potenziati e colpi critici casuali' },
  { key: 'xp', label: '⭐ Esperienza', desc: 'XP dai nemici, livelli e punti abilità' },
]

function CombattimentoTab({ rpg, patch }: { rpg: NonNullable<GameProject['settings']['rpg']>; patch: (fn: (r: NonNullable<GameProject['settings']['rpg']>) => void) => void }) {
  const combat = { parry: true, dodge: true, sprint: true, mana: true, combo: true, xp: true, ...(rpg.combat ?? {}) }
  const items = rpg.items ?? []
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h3 className="text-lg font-bold text-[var(--tx)]">⚔️ Combattimento</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {COMBAT_TOGGLES.map(t => (
          <label key={t.key} className="cp-panel flex cursor-pointer flex-col gap-1 p-3">
            <span className="flex items-center gap-2 font-semibold text-[var(--tx)]">
              <input type="checkbox" checked={combat[t.key]} onChange={e => patch(r => {
                r.combat = { ...combat, [t.key]: e.target.checked }
              })} />
              {t.label}
            </span>
            <span className="text-xs text-[var(--tx-dim)]">{t.desc}</span>
          </label>
        ))}
      </div>
      <Num label="XP per nemico ucciso" v={rpg.xpPerKill ?? 20} min={1} max={500} on={v => patch(r => { r.xpPerKill = v })} />
      <div>
        <Label className="text-[var(--tx-dim)]">Oggetti nell&apos;inventario all&apos;avvio</Label>
        <div className="mt-2 flex flex-wrap gap-1">
          {items.length === 0 && <span className="text-xs text-[var(--tx-faint)]">Crea oggetti nella scheda Oggetti.</span>}
          {items.map(it => {
            const on = (rpg.startItems ?? []).includes(it.id)
            return (
              <button key={it.id} className={`cp-chip cursor-pointer text-xs ${on ? 'ring-1 ring-[var(--neon)]' : 'opacity-60'}`}
                onClick={() => patch(r => {
                  const cur = r.startItems ?? []
                  r.startItems = on ? cur.filter(x => x !== it.id) : [...cur, it.id]
                })}>
                {it.icon} {it.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 9. CASE ENTRABILI
// ============================================================

function CaseTab({ project, mutate }: { project: GameProject; mutate: (fn: (p: GameProject) => void) => void }) {
  const makeHouse = () => {
    mutate(p => {
      const n = p.scenes.length + 1
      const w = 12
      const h = 12
      const tiles = new Array(w * h).fill(0)
      // pavimento interno + muri perimetrali
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
        tiles[y * w + x] = edge ? 1 : 2
      }
      // porta d'ingresso in basso (tile porta 5) e porta di ritorno
      tiles[(h - 1) * w + Math.floor(w / 2)] = 5
      tiles[Math.floor(w / 2)] = 5
      const scene: GameScene = {
        id: eid(), name: `Casa ${n - 1}`, w, h, tiles,
        entities: [
          { id: eid(), type: 'deco', x: 2, y: 2, props: { kind: 'barile' } },
          { id: eid(), type: 'deco', x: 9, y: 2, props: { kind: 'barile' } },
          { id: eid(), type: 'deco', x: 6, y: 3, props: { kind: 'lanterna' } },
          { id: eid(), type: 'item', x: 6, y: 6, props: { kind: 'cassa' } },
          { id: eid(), type: 'door', x: Math.floor(w / 2), y: h - 2, props: { name: 'Uscita', targetScene: p.startScene, tx: Math.floor(p.scenes[0].w / 2), ty: p.scenes[0].h - 3 } },
        ],
      }
      p.scenes.push(scene)
      toast.success(`Interno «Casa ${n - 1}» creato: ora collega una porta!`)
    })
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h3 className="text-lg font-bold text-[var(--tx)]">🏠 Case entrabili</h3>
      <p className="text-sm text-[var(--tx-dim)]">
        Ogni <b>interno</b> è una scena a sé raggiunta dalle porte. Quando nel mondo 3D entri in una
        porta, vieni teletrasportato dentro la casa — con mobili, casse e uscite.
      </p>
      <Button className="cp-btn w-fit bg-[var(--neon)] font-bold text-[#04060d]" onClick={makeHouse}>
        🏗 Crea interno casa pronto
      </Button>
      <div className="cp-panel flex flex-col gap-2 p-4 text-sm text-[var(--tx-dim)]">
        <p className="font-semibold text-[var(--tx)]">Come collegare una porta (3 passi):</p>
        <p>1. Chiudi questa scheda, torna nell&apos;editor e scegli lo strumento <b>Porta → scena</b>.</p>
        <p>2. Piazzala dove vuoi l&apos;ingresso della casa.</p>
        <p>3. Seleziona la porta e imposta <b>destinazione</b> = la scena dell&apos;interno. Fatto: entra e esci!</p>
      </div>
      <div className="cp-panel p-4 text-sm">
        <p className="mb-2 font-semibold text-[var(--tx)]">Scene del gioco ({project.scenes.length}):</p>
        <div className="flex flex-wrap gap-1">
          {project.scenes.map(s => <span key={s.id} className="cp-chip text-xs">{s.name} · {s.w}×{s.h}</span>)}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// utilità: campo numerico
// ============================================================

function Num({ label, v, min, max, step = 1, on, hidden }: {
  label: string; v: number; min: number; max: number; step?: number
  on: (v: number) => void; hidden?: boolean
}) {
  if (hidden) return null
  return (
    <div>
      <Label className="text-[10px] text-[var(--tx-faint)]">{label}</Label>
      <Input
        type="number" value={v} min={min} max={max} step={step}
        className="h-8"
        onChange={e => {
          const n = Number(e.target.value)
          if (!isNaN(n)) on(Math.max(min, Math.min(max, n)))
        }}
      />
    </div>
  )
}
