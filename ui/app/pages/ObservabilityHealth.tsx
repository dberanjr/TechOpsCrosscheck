import React from 'react';
import { useDql } from '@dynatrace-sdk/react-hooks';
// Colors
const DT_RED = '#E24B4A';
const DT_ORANGE = '#E06B00';
const DT_AMBER = '#F5A800';
const DT_PURPLE = '#7C38A0';
const DT_CYAN = '#54C8E9';
const DT_GREEN = '#73BE28';
const DT_BLUE = '#1C5BE5';
const DT_BLUE_LIGHT = '#1497FF';
const DT_PINK = '#B23BE4';
const DT_MAGENTA = '#E436FF';
const TEXT_PRIMARY = '#DCE8F5';
const TEXT_SECONDARY = '#B0C0D0';
const TEXT_MUTED = '#7090A8';
const TEXT_HINT = '#506070';
const BG_SHELL = '#09111E';
const BG_CARD = '#0E1828';
const BG_DEEP = '#060D18';
const BG_ROW_HOVER = 'rgba(255,255,255,0.04)';

const C = { DT_RED, DT_ORANGE, DT_AMBER, DT_PURPLE, DT_CYAN, DT_GREEN, DT_BLUE, DT_BLUE_LIGHT, DT_PINK, DT_MAGENTA, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, TEXT_HINT, BG_SHELL, BG_CARD, BG_DEEP, BG_ROW_HOVER };

// ---------------------------------------------------------------------------
// Single master DQL query — entity-first approach, confirmed via dtctl.
// Starts from monitored entities (on-prem hosts + AWS cloud workloads),
// then joins all signals and CMDB metadata server-side.
// This matches the working dashboard pattern and excludes defunct CMDB apps.
// ---------------------------------------------------------------------------

const MASTER_QUERY = `fetch dt.entity.host
| limit 100000
| filter lifetime[end] > asTimestamp(now()-24h)
| filterOut matchesValue(cloudType,"EC2") or matchesValue(cloudType,"AZURE") or isNull(monitoringMode)
| fieldsAdd applicationci=splitString(arrayRemoveNulls(iCollectArray(if(matchesValue(tags[], "*applicationci*"), lower(tags[]))))[0], ":")[1]
| filter isNotNull(applicationci) and applicationci != ""
| fieldsAdd is_fullstack = if(monitoringMode == "FULL_STACK", 1, else: 0)
| summarize {host_count=count(), fullstack_count=sum(is_fullstack)}, by:{applicationci}

| append [
  fetch bizevents, from:-24h
  | filter event.type=="workflow.summary.cloud.aws"
  | filter contains(type, "ecs") or contains(type, "eks") or contains(type, "lambda") or contains(type, "EC2_INSTANCE") or contains(type, "step")
  | fieldsAdd applicationci=lower(applicationci)
  | filter isNotNull(applicationci) and applicationci != ""
  | fieldsAdd host_count=0, fullstack_count=0
  | summarize {host_count=sum(host_count), fullstack_count=sum(fullstack_count)}, by:{applicationci}
]

| dedup applicationci, sort:{fullstack_count desc}

| lookup [fetch dt.entity.service
  | fieldsAdd applicationci=splitString(arrayRemoveNulls(iCollectArray(if(matchesValue(tags[], "*applicationci*"), lower(tags[]))))[0], ":")[1]
  | filter isNotNull(applicationci) and applicationci != ""
  | summarize svc_count=count(), by:{applicationci}
], sourceField:applicationci, lookupField:applicationci, fields:{svc_count}

| lookup [fetch logs, from:-24h, scanLimitGBytes:-1, samplingRatio:100
  | filter isNotNull(applicationci)
  | summarize log_count=count(), by:{applicationci=lower(applicationci)}
], sourceField:applicationci, lookupField:applicationci, fields:{log_count}

| lookup [fetch dt.entity.application, from:now()-1000d
  | fieldsAdd applicationci=splitString(arrayRemoveNulls(iCollectArray(if(matchesValue(tags[], "*applicationci*"), lower(tags[]))))[0], ":")[1]
  | filter isNotNull(applicationci) and applicationci != ""
  | fieldsAdd rum_active=if(lifetime[end] > now()-7d, true, else: false)
  | summarize rum_active=max(rum_active), by:{applicationci}
], sourceField:applicationci, lookupField:applicationci, fields:{rum_active}

| lookup [fetch bizevents, from:-24h
  | filter event.type=="workflow.import.servicenow.appci"
  | fields applicationci=lower(applicationci), ciname, tier, app_owner_name
], sourceField:applicationci, lookupField:applicationci, fields:{ciname, tier, app_owner_name}

| lookup [fetch dt.davis.problems, from:-24h
  | filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
  | fieldsAdd tags_str = toString(entity_tags)
  | filter matchesPhrase(tags_str, "applicationci:")
  | parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
  | filter isNotNull(appci) and appci != ""
  | fieldsAdd appci = lower(appci)
  | fieldsAdd is_active = if(event.status == "ACTIVE", 1, else: 0)
  | summarize {active_probs=sum(is_active), probs_24h=count()}, by:{appci}
], sourceField:applicationci, lookupField:appci, fields:{active_probs, probs_24h}

| lookup [fetch bizevents, from:-72h
  | filter event.type == "workflow.summary.service"
  | summarize blast=countDistinct(consumer.appci), by:{provider.appci}
], sourceField:applicationci, lookupField:provider.appci, fields:{blast}

| lookup [fetch bizevents, from:-72h
  | filter event.type == "workflow.summary.service"
  | summarize deps=countDistinct(provider.appci), by:{consumer.appci}
], sourceField:applicationci, lookupField:consumer.appci, fields:{deps}`;

// Orphaned problems (7d) — no applicationci tag — separate query for the orphan card.
const ORPHAN_QUERY = `fetch dt.davis.problems, from:-7d
| filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
| fieldsAdd tags_str = toString(entity_tags)
| filterOut matchesPhrase(tags_str, "applicationci")
| summarize total=count(), avg_dur_ns=avg(resolved_problem_duration), by:{event.status}`;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface MasterRec {
  applicationci: string;
  host_count:    number;
  fullstack_count: number;
  svc_count:     number | null;
  log_count:     number | null;
  rum_active:    boolean | null;
  ciname:        string | null;
  tier:          string | null;
  app_owner_name: string | null;
  active_probs:  number | null;
  probs_24h:     number | null;
  blast:         number | null;
  deps:          number | null;
}
interface OrphanRec { 'event.status': string; total: number; avg_dur_ns: number | null; }

export interface HealthRow {
  appci: string;
  name: string;
  tier: '1' | '2' | '3' | '4' | '';
  owner: string;
  hasAgent: boolean;
  fullStack: boolean;
  hasTraces: boolean;
  hasLogs: boolean;
  hasRum: boolean;
  sigs: number;
  gaps: number;
  obsScore: number;
  activeProbs: number;
  probs24h: number;
  blast: number;
  deps: number;
  priority: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function tierKey(label: string): '1' | '2' | '3' | '4' | '' {
  if (label.startsWith('1')) return '1';
  if (label.startsWith('2')) return '2';
  if (label.startsWith('3')) return '3';
  if (label.startsWith('4')) return '4';
  return '';
}

function fmtHours(ns: number | null): string {
  if (ns == null || ns === 0) return '–';
  const h = ns / 3_600_000_000_000;
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function obsColor(score: number): string {
  if (score >= 75) return C.DT_GREEN;
  if (score >= 40) return C.DT_AMBER;
  return C.DT_RED;
}

function Check({ ok, na }: { ok: boolean; na?: boolean }) {
  if (na) return <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>–</span>;
  return ok
    ? <span style={{ color: C.DT_GREEN, fontSize: 13, lineHeight: 1 }}>✓</span>
    : <span style={{ color: C.DT_RED,   fontSize: 13, lineHeight: 1 }}>✗</span>;
}

// ---------------------------------------------------------------------------
// Orphaned Problem Attribution Card
// ---------------------------------------------------------------------------

function OrphanedCard({ orphanData, loading }: {
  orphanData: { total: number; active: number; avgDurNs: number | null };
  loading: boolean;
}) {
  const attrPct = 54.7; // confirmed UAL finding from spec
  const val = (v: number | string) => (
    <span style={{ fontSize: 20, fontWeight: 600, color: C.TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
  );

  return (
    <div style={{
      border: `1px solid ${C.DT_RED}44`,
      borderLeft: `3px solid ${C.DT_RED}`,
      borderRadius: 6,
      background: `${C.DT_RED}08`,
      padding: '14px 20px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 500, color: C.DT_RED, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Orphaned Problem Attribution
        </span>
        <span style={{ fontSize: 8.5, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>7-DAY WINDOW</span>
      </div>

      {/* Attribution bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: C.TEXT_SECONDARY }}>Attributed to appci</span>
          <span style={{ fontSize: 9, color: C.TEXT_SECONDARY }}>Orphaned (no appci)</span>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${attrPct}%`, height: '100%', background: C.DT_GREEN, borderRadius: '4px 0 0 4px' }} />
          <div style={{ flex: 1,              height: '100%', background: C.DT_RED,   borderRadius: '0 4px 4px 0' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 9.5, color: C.DT_GREEN, fontWeight: 500 }}>{attrPct}%</span>
          <span style={{ fontSize: 9.5, color: C.DT_RED,   fontWeight: 500 }}>{(100 - attrPct).toFixed(1)}%</span>
        </div>
      </div>

      {/* Stat boxes */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        {[
          { label: 'Orphaned (7d total)',   value: loading ? '…' : String(orphanData.total)  },
          { label: 'Active orphaned now',   value: loading ? '…' : String(orphanData.active) },
          { label: 'Avg MTTR (orphaned)',   value: loading ? '…' : fmtHours(orphanData.avgDurNs) },
          { label: 'DI root cause rate',    value: '0%'  },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: '8px 12px',
            border: '0.5px solid rgba(255,255,255,0.08)',
          }}>
            {val(s.value)}
            <div style={{ fontSize: 8.5, color: C.TEXT_HINT, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 9.5, color: C.TEXT_SECONDARY, margin: 0, lineHeight: 1.6 }}>
        These problems originate from Extension-monitored entities (IBM MQ, F5 BigIP, SHARES/CICS/IMS mainframes, AWS CloudWatch)
        that have no Smartscape topology edges. Davis AI cannot traverse to them during fault tree analysis — their failures surface
        as unattributed orphan problems with no root cause identification and significantly higher MTTR.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extension Infrastructure cards + Smartscape 2.0 callout
// ---------------------------------------------------------------------------

interface ExtCardData {
  name: string;
  icon: string;
  chips: { label: string; ok: boolean }[];
  note: string;
}

const EXT_CARDS: ExtCardData[] = [
  {
    name: 'IBM MQ',
    icon: '⬡',
    chips: [
      { label: 'Metrics flowing', ok: true },
      { label: 'No topology edges', ok: false },
      { label: 'No appci linkage', ok: false },
    ],
    note: 'Queue depth, message rate, and consumer lag metrics are collected. Queue manager entities exist as Custom Devices but have no Smartscape relationships to upstream services.',
  },
  {
    name: 'F5 BigIP',
    icon: '⬡',
    chips: [
      { label: 'Metrics flowing', ok: true },
      { label: 'No topology edges', ok: false },
      { label: 'No appci linkage', ok: false },
    ],
    note: 'VIP availability and throughput metrics collected. Pool member failures generate one alert per VIP×app pair — a single F5 event routinely produces 30–40 orphaned problems.',
  },
  {
    name: 'SHARES / CICS / IMS',
    icon: '⬡',
    chips: [
      { label: 'Metrics flowing', ok: true },
      { label: 'No topology edges', ok: false },
      { label: 'No appci linkage', ok: false },
    ],
    note: 'Mainframe transaction and response time metrics flow via the z/OS Extension. CICS and IMS regions are Custom Devices with no Smartscape edges to dependent Java services.',
  },
  {
    name: 'AWS CloudWatch',
    icon: '⬡',
    chips: [
      { label: 'Metrics flowing', ok: true },
      { label: 'Partial topology', ok: true },
      { label: 'appci via tag', ok: false },
    ],
    note: 'CloudWatch metrics ingested for Lambda and ECS. AWS resource entities have partial native Smartscape edges but are not tagged with applicationci, so they cannot be linked to the CMDB.',
  },
];

function ExtCard({ card }: { card: ExtCardData }) {
  return (
    <div style={{
      border: `0.5px solid rgba(255,255,255,0.1)`,
      borderLeft: `2px solid ${C.DT_BLUE}`,
      borderRadius: 4,
      padding: '10px 14px',
      background: `${C.DT_BLUE}08`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 9, color: C.DT_BLUE }}>{card.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 500, color: C.TEXT_PRIMARY }}>{card.name}</span>
        {card.chips.map(c => (
          <span key={c.label} style={{
            fontSize: 8, padding: '1px 6px', borderRadius: 10,
            background: c.ok ? `${C.DT_GREEN}22` : `${C.DT_RED}22`,
            color: c.ok ? C.DT_GREEN : C.DT_RED,
            border: `0.5px solid ${c.ok ? C.DT_GREEN : C.DT_RED}44`,
          }}>
            {c.label}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 9, color: C.TEXT_SECONDARY, margin: 0, lineHeight: 1.6 }}>{card.note}</p>
    </div>
  );
}

function Smartscape2Callout() {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{
      border: `0.5px solid ${C.DT_PURPLE}44`,
      borderRadius: 6,
      background: `${C.DT_PURPLE}08`,
      overflow: 'hidden',
      marginTop: 16,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: `${C.DT_PURPLE}18`, border: 'none',
          borderBottom: open ? `0.5px solid ${C.DT_PURPLE}30` : 'none',
          padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 7.5, padding: '1px 6px', borderRadius: 10,
            background: `${C.DT_PURPLE}30`, color: C.DT_PURPLE, textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            smartscape 2.0
          </span>
          <span style={{ fontSize: 9.5, color: C.DT_PURPLE, fontWeight: 500 }}>
            Topology injection will resolve orphaned problem attribution
          </span>
        </div>
        <span style={{ fontSize: 9, color: C.TEXT_HINT }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 8.5, color: C.DT_RED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Current State</div>
              <p style={{ fontSize: 9.5, color: C.TEXT_SECONDARY, margin: '0 0 6px', lineHeight: 1.65 }}>
                Custom device entities from Extensions have no Smartscape edges. Davis AI's Causal AI cannot
                traverse to them during fault tree analysis.
              </p>
              <p style={{ fontSize: 9.5, color: C.TEXT_SECONDARY, margin: 0, lineHeight: 1.65 }}>
                Result: ~32,405 orphaned, unattributed problems per week with no DI root cause identification.
              </p>
            </div>
            <div>
              <div style={{ fontSize: 8.5, color: C.DT_GREEN, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Future State — Smartscape 2.0</div>
              <p style={{ fontSize: 9.5, color: C.TEXT_SECONDARY, margin: '0 0 6px', lineHeight: 1.65 }}>
                Extension Framework 2.0 supports explicit relationship injection. Developers declare typed topology edges
                (e.g., <code style={{ fontSize: 9, color: C.DT_CYAN }}>ibm-mq-queue-manager → calls → service</code>).
              </p>
              <ul style={{ fontSize: 9.5, color: C.TEXT_SECONDARY, margin: '0 0 6px', paddingLeft: 16, lineHeight: 1.65 }}>
                <li>Davis AI includes Extension entities in fault tree analysis</li>
                <li>F5 BigIP pool failure = one attributed problem, not 40 orphaned alerts</li>
                <li>32,405 orphaned problems per week collapses toward true causal roots</li>
              </ul>
            </div>
          </div>
          <div style={{
            marginTop: 10, padding: '6px 10px',
            background: `${C.DT_PURPLE}12`, border: `0.5px solid ${C.DT_PURPLE}30`, borderRadius: 3,
            fontSize: 9, color: C.TEXT_SECONDARY,
          }}>
            <strong style={{ color: C.DT_PURPLE }}>Action:</strong> Evaluate IBM MQ, F5, and mainframe Extensions for EF 2.0 upgrade.
            Request Smartscape relationship injection support from Dynatrace product team.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage Table
// ---------------------------------------------------------------------------

type SortCol = keyof HealthRow | null;
type QuickFilter = 'all' | 'dark' | 'active' | 'gaps';

const PAGE_SIZE = 50;

const COL_HEADERS: { key: SortCol; label: string; width?: number | string; align?: 'left' | 'right' | 'center' }[] = [
  { key: 'name',        label: 'App Name',    width: '14%', align: 'left'   },
  { key: 'appci',       label: 'AppCI',       width: 80,    align: 'left'   },
  { key: 'tier',        label: 'Tier',        width: 44,    align: 'center' },
  { key: 'owner',       label: 'Owner',       width: '11%', align: 'left'   },
  { key: 'hasAgent',    label: '1A',          width: 32,    align: 'center' },
  { key: 'fullStack',   label: 'FS',          width: 32,    align: 'center' },
  { key: 'hasTraces',   label: 'Traces',      width: 44,    align: 'center' },
  { key: 'hasLogs',     label: 'Logs',        width: 44,    align: 'center' },
  { key: 'hasRum',      label: 'RUM',         width: 44,    align: 'center' },
  { key: 'obsScore',    label: 'Score',       width: 64,    align: 'center' },
  { key: 'activeProbs', label: 'Active ⚡',   width: 56,    align: 'center' },
  { key: 'blast',       label: 'Blast',       width: 48,    align: 'center' },
  { key: 'deps',        label: 'Deps',        width: 44,    align: 'center' },
  { key: 'priority',    label: 'Priority',    width: 56,    align: 'center' },
];

function rowBorderColor(row: HealthRow): string {
  if (row.activeProbs > 0 && row.sigs === 0) return C.DT_RED;
  if (row.sigs === 4) return C.DT_GREEN;
  if (row.gaps > 0) return C.DT_AMBER;
  return 'transparent';
}

function TierBadge({ tier }: { tier: HealthRow['tier'] }) {
  const colors: Record<string, string> = { '1': C.DT_RED, '2': C.DT_AMBER, '3': C.DT_BLUE_LIGHT, '4': C.TEXT_HINT };
  const c = tier ? (colors[tier] ?? C.TEXT_HINT) : C.TEXT_HINT;
  return (
    <span style={{
      fontSize: 8, padding: '1px 5px', borderRadius: 3,
      background: `${c}22`, color: c, border: `0.5px solid ${c}44`,
      fontWeight: 600,
    }}>
      {tier ? `T${tier}` : '–'}
    </span>
  );
}

function CoverageTable({ rows, loading }: { rows: HealthRow[]; loading: boolean }) {
  const [sortCol, setSortCol]   = React.useState<SortCol>('priority');
  const [sortDir, setSortDir]   = React.useState<'asc' | 'desc'>('desc');
  const [quickFilter, setQF]    = React.useState<QuickFilter>('all');
  const [search, setSearch]     = React.useState('');
  const [tierFilter, setTierF]  = React.useState<'all' | '1' | '2' | '3' | '4'>('all');
  const [ownerFilter, setOwnerF]= React.useState('');
  const [page, setPage]         = React.useState(1);

  const ownerList = React.useMemo(() => {
    const s = new Set(rows.map(r => r.owner).filter(Boolean));
    return [...s].sort();
  }, [rows]);

  const filtered = React.useMemo(() => {
    let r = rows;
    if (quickFilter === 'dark')   r = r.filter(x => x.sigs === 0);
    if (quickFilter === 'active') r = r.filter(x => x.activeProbs > 0);
    if (quickFilter === 'gaps')   r = r.filter(x => x.gaps > 0);
    if (tierFilter !== 'all')     r = r.filter(x => x.tier === tierFilter);
    if (ownerFilter)              r = r.filter(x => x.owner === ownerFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(x => x.appci.includes(q) || x.name.toLowerCase().includes(q));
    }
    return r;
  }, [rows, quickFilter, tierFilter, ownerFilter, search]);

  const sorted = React.useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol] as number | string | boolean;
      const bv = b[sortCol] as number | string | boolean;
      const cmp = typeof av === 'string' ? (av as string).localeCompare(bv as string) : Number(av) - Number(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
    setPage(1);
  }

  function handleQF(qf: QuickFilter) {
    setQF(qf);
    setPage(1);
  }

  const QF_OPTIONS: { key: QuickFilter; label: string }[] = [
    { key: 'all',    label: 'All' },
    { key: 'dark',   label: 'Fully Dark' },
    { key: 'active', label: 'Active Problems' },
    { key: 'gaps',   label: 'Has Gaps' },
  ];

  const TIER_OPTS: { key: 'all' | '1' | '2' | '3' | '4'; label: string; accent: string }[] = [
    { key: 'all', label: 'All Tiers', accent: C.TEXT_SECONDARY },
    { key: '1',   label: 'T1',        accent: C.DT_RED },
    { key: '2',   label: 'T2',        accent: C.DT_AMBER },
    { key: '3',   label: 'T3',        accent: C.DT_BLUE_LIGHT },
    { key: '4',   label: 'T4',        accent: C.TEXT_HINT },
  ];

  const selectStyle: React.CSSProperties = {
    background: '#0C1826', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
    color: C.TEXT_MUTED, fontSize: 11, padding: '3px 24px 3px 8px', cursor: 'pointer', outline: 'none',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='rgba(255%2C255%2C255%2C0.3)'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center',
  };

  const thStyle: React.CSSProperties = {
    padding: '6px 8px', fontSize: 8.5, color: C.TEXT_HINT,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    background: 'rgba(255,255,255,0.04)', cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap', borderBottom: '0.5px solid rgba(255,255,255,0.08)',
  };

  return (
    <div>
      {/* Filter toolbar — row 1: status pills + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0 6px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {QF_OPTIONS.map(qf => (
            <button
              key={qf.key}
              onClick={() => handleQF(qf.key)}
              style={{
                background: quickFilter === qf.key ? `${C.DT_BLUE_LIGHT}22` : 'transparent',
                border: `0.5px solid ${quickFilter === qf.key ? C.DT_BLUE_LIGHT : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 4, color: quickFilter === qf.key ? C.DT_BLUE_LIGHT : C.TEXT_MUTED,
                fontSize: 10, padding: '3px 9px', cursor: 'pointer', fontWeight: quickFilter === qf.key ? 500 : 400,
              }}
            >
              {qf.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search AppCI / App Name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{
            background: '#0C1826', border: `1px solid ${search ? C.DT_BLUE_LIGHT : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 4, color: search ? C.TEXT_PRIMARY : C.TEXT_MUTED,
            fontSize: 11, padding: '3px 8px', outline: 'none', width: 200,
          }}
        />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: C.TEXT_HINT }}>
          <span style={{ color: C.TEXT_SECONDARY, fontWeight: 500 }}>{sorted.length}</span> apps
        </span>
      </div>

      {/* Filter toolbar — row 2: tier pills + director dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TIER_OPTS.map(t => {
            const active = tierFilter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTierF(t.key); setPage(1); }}
                style={{
                  background: active ? `${t.accent}22` : 'transparent',
                  border: `0.5px solid ${active ? t.accent : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 4, color: active ? t.accent : C.TEXT_MUTED,
                  fontSize: 10, padding: '3px 9px', cursor: 'pointer', fontWeight: active ? 600 : 400,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Director / owner dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Director:</span>
          <select value={ownerFilter} onChange={e => { setOwnerF(e.target.value); setPage(1); }} style={selectStyle}>
            <option value="">All</option>
            {ownerList.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
          <thead>
            <tr>
              {COL_HEADERS.map(col => (
                <th
                  key={String(col.key)}
                  onClick={() => toggleSort(col.key)}
                  style={{
                    ...thStyle,
                    width: col.width,
                    textAlign: col.align ?? 'left',
                  }}
                >
                  {col.label}
                  {sortCol === col.key && (
                    <span style={{ marginLeft: 3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COL_HEADERS.length} style={{ textAlign: 'center', padding: 40, fontSize: 9.5, color: C.TEXT_HINT, letterSpacing: '0.06em' }}>
                QUERYING DYNATRACE…
              </td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={COL_HEADERS.length} style={{ textAlign: 'center', padding: 40, fontSize: 9.5, color: C.TEXT_HINT }}>
                No apps match the current filter
              </td></tr>
            ) : pageRows.map((row, i) => {
              const bc = rowBorderColor(row);
              return (
                <tr
                  key={row.appci}
                  style={{
                    borderLeft: `3px solid ${bc}`,
                    background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.BG_ROW_HOVER)}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent')}
                >
                  <td style={{ padding: '5px 8px', fontSize: 9.5, color: C.TEXT_PRIMARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</td>
                  <td style={{ padding: '5px 8px', fontSize: 9, color: C.DT_BLUE_LIGHT, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.appci.toUpperCase()}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}><TierBadge tier={row.tier} /></td>
                  <td style={{ padding: '5px 8px', fontSize: 9, color: C.TEXT_MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.owner || '–'}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}><Check ok={row.hasAgent} /></td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}><Check ok={row.fullStack} na={!row.hasAgent} /></td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}><Check ok={row.hasTraces} /></td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}><Check ok={row.hasLogs} /></td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}><Check ok={row.hasRum} /></td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 500, color: obsColor(row.obsScore), minWidth: 24, textAlign: 'right' }}>{row.obsScore}</span>
                      <div style={{ width: 24, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                        <div style={{ width: `${row.obsScore}%`, height: '100%', background: obsColor(row.obsScore), borderRadius: 2 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, fontWeight: row.activeProbs > 0 ? 600 : 400, color: row.activeProbs > 0 ? C.DT_RED : C.TEXT_MUTED }}>
                    {row.activeProbs > 0 ? row.activeProbs : '–'}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, color: row.blast > 30 ? C.DT_RED : row.blast > 10 ? C.DT_AMBER : C.TEXT_SECONDARY }}>
                    {row.blast > 0 ? row.blast : '–'}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, color: C.TEXT_SECONDARY }}>{row.deps > 0 ? row.deps : '–'}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                      background: row.priority > 30 ? `${C.DT_RED}22` : row.priority > 15 ? `${C.DT_AMBER}22` : 'rgba(255,255,255,0.05)',
                      color: row.priority > 30 ? C.DT_RED : row.priority > 15 ? C.DT_AMBER : C.TEXT_MUTED,
                    }}>
                      {row.priority}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0 0' }}>
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 3,
              color: page === 1 ? C.TEXT_HINT : C.TEXT_SECONDARY, fontSize: 10, padding: '3px 10px', cursor: page === 1 ? 'default' : 'pointer',
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 9.5, color: C.TEXT_HINT }}>
            Page <span style={{ color: C.TEXT_SECONDARY }}>{page}</span> of {totalPages}
            {' · '}<span style={{ color: C.TEXT_SECONDARY }}>{sorted.length}</span> apps
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{
              background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 3,
              color: page === totalPages ? C.TEXT_HINT : C.TEXT_SECONDARY, fontSize: 10, padding: '3px 10px', cursor: page === totalPages ? 'default' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owner Accountability Chart
// ---------------------------------------------------------------------------

function OwnerChart({ rows }: { rows: HealthRow[] }) {
  const chartData = React.useMemo(() => {
    const counts = new Map<string, { dark: number; total: number }>();
    rows.filter(r => r.tier === '1').forEach(r => {
      const prev = counts.get(r.owner) ?? { dark: 0, total: 0 };
      counts.set(r.owner, { dark: prev.dark + (r.sigs === 0 ? 1 : 0), total: prev.total + 1 });
    });
    return [...counts.entries()]
      .filter(([, v]) => v.dark > 0)
      .sort(([, a], [, b]) => b.dark - a.dark)
      .slice(0, 12);
  }, [rows]);

  if (chartData.length === 0) return null;

  const maxDark = chartData[0]?.[1].dark ?? 1;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 9, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Owner Accountability — Dark T1 Apps
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {chartData.map(([owner, { dark, total }]) => (
          <div key={owner} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 9, color: C.TEXT_SECONDARY, minWidth: 160, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {owner}
            </span>
            <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${clamp(dark / maxDark * 100, 0, 100)}%`, height: '100%', background: C.DT_ORANGE, borderRadius: 4, transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontSize: 9, color: C.DT_ORANGE, minWidth: 40, fontVariantNumeric: 'tabular-nums' }}>
              {dark} / {total}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 8.5, color: C.TEXT_HINT, marginTop: 6 }}>Dark (0 signals) / T1 total per owner</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instrumentation Roadmap
// ---------------------------------------------------------------------------

const ROADMAP_COLS = [
  {
    header: 'Instrument Now',
    accent: C.DT_GREEN,
    items: [
      { appci: 'Review via table', note: 'Apps with sigs=0 and no mainframe/legacy tag. Owner notified. OneAgent auto-deploy eligible.' },
      { appci: 'Cloud-native targets', note: 'EKS workloads without OneAgent: deploy via DaemonSet. Est. gain: 4 signals per app.' },
      { appci: 'Log forwarding gaps', note: 'Apps with agent but no logs: configure log ingest rule in Deployment Controller.' },
    ],
    footer: 'Estimated timeline: 2–4 weeks per batch with automation support.',
  },
  {
    header: 'Needs Custom Integration',
    accent: C.DT_AMBER,
    items: [
      { appci: 'IBM MQ Queue Managers', note: 'EF 2.0 upgrade required. Topology edges must be declared. Estimated effort: 6 weeks.' },
      { appci: 'CICS / IMS Regions', note: 'z/OS Extension topology injection. Requires mainframe team coordination. 8+ weeks.' },
      { appci: 'F5 BigIP VIPs', note: 'F5 Extension EF 2.0 upgrade + iRule-based appci tag propagation. 4–6 weeks.' },
    ],
    footer: 'These require Dynatrace Professional Services or dedicated engineering sprint.',
  },
  {
    header: 'Third-Party / Excepted',
    accent: C.DT_BLUE,
    items: [
      { appci: 'UAX Airlines systems', note: 'External partner infrastructure. No agent access. Formal exception filed.' },
      { appci: 'ACARS avionics', note: 'FAA-regulated avionics network. Monitoring prohibited by regulation.' },
      { appci: 'AWS CloudWatch only', note: 'Vendor-managed SaaS without agent access. CloudWatch bridge in place.' },
    ],
    footer: 'Exception rationale documented in UAL Observability Exception Register.',
  },
];

function InstrumentRoadmap() {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 9, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Instrumentation Roadmap
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {ROADMAP_COLS.map(col => (
          <div key={col.header} style={{
            border: `0.5px solid ${col.accent}30`,
            borderTop: `2px solid ${col.accent}`,
            borderRadius: 4, padding: '12px 14px',
            background: `${col.accent}06`,
          }}>
            <div style={{ fontSize: 9, color: col.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
              {col.header}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {col.items.map(item => (
                <div key={item.appci}>
                  <div style={{ fontSize: 9.5, color: C.TEXT_PRIMARY, fontWeight: 500, marginBottom: 2 }}>{item.appci}</div>
                  <div style={{ fontSize: 8.5, color: C.TEXT_SECONDARY, lineHeight: 1.5 }}>{item.note}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 8.5, color: C.TEXT_HINT, borderTop: '0.5px solid rgba(255,255,255,0.06)', paddingTop: 8, lineHeight: 1.5 }}>
              {col.footer}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portfolio Insight Tile
// ---------------------------------------------------------------------------

function PortfolioInsightTile({ rows }: { rows: HealthRow[] }) {
  const total         = rows.length;
  const fullyCovered  = rows.filter(r => r.sigs >= 4).length;
  const hasGaps       = rows.filter(r => r.sigs > 0 && r.sigs < 4).length;
  const fullyDark     = rows.filter(r => r.sigs === 0).length;
  const pct = (n: number) => total > 0 ? Math.round(n / total * 100) : 0;

  const agentCount  = rows.filter(r => r.hasAgent).length;
  const fsCount     = rows.filter(r => r.fullStack).length;
  const tracesCount = rows.filter(r => r.hasTraces).length;
  const logsCount   = rows.filter(r => r.hasLogs).length;
  const rumCount    = rows.filter(r => r.hasRum).length;

  const signalBars = [
    { label: 'OneAgent',   count: agentCount,  color: C.DT_GREEN },
    { label: 'Full Stack', count: fsCount,      color: C.DT_CYAN },
    { label: 'Traces',     count: tracesCount,  color: C.DT_BLUE_LIGHT },
    { label: 'Logs',       count: logsCount,    color: C.DT_PURPLE },
    { label: 'RUM',        count: rumCount,     color: C.DT_AMBER },
  ];

  const tierStats = (['1', '2', '3', '4'] as const).map(t => {
    const tr    = rows.filter(r => r.tier === t);
    const count = tr.length;
    const covered   = tr.filter(r => r.sigs >= 4).length;
    const dark      = tr.filter(r => r.sigs === 0).length;
    const avgScore  = count > 0 ? Math.round(tr.reduce((s, r) => s + r.obsScore, 0) / count) : 0;
    return { tier: t, count, covered, dark, avgScore, covPct: count > 0 ? Math.round(covered / count * 100) : 0 };
  });

  const tierAccents: Record<string, string> = { '1': C.DT_RED, '2': C.DT_AMBER, '3': C.DT_BLUE_LIGHT, '4': C.TEXT_HINT };

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 9, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Portfolio Observability Breakdown
      </div>

      {/* Hero stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Total Apps',     value: total,        accent: C.TEXT_PRIMARY, sub: 'in CMDB' },
          { label: 'Fully Covered',  value: fullyCovered, accent: C.DT_GREEN,     sub: `${pct(fullyCovered)}% of portfolio` },
          { label: 'Has Gaps',       value: hasGaps,      accent: C.DT_AMBER,     sub: `${pct(hasGaps)}% of portfolio` },
          { label: 'Fully Dark',     value: fullyDark,    accent: C.DT_RED,       sub: `${pct(fullyDark)}% of portfolio` },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '12px 16px',
            border: `0.5px solid rgba(255,255,255,0.08)`, borderTop: `2px solid ${s.accent}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: s.accent, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: 8.5, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 9, color: C.TEXT_SECONDARY, marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Signal coverage + tier breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Signal bars */}
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '14px 16px', border: '0.5px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 9, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Signal Coverage</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {signalBars.map(s => {
              const p = pct(s.count);
              return (
                <div key={s.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 9.5, color: C.TEXT_SECONDARY }}>{s.label}</span>
                    <span style={{ fontSize: 9.5, fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: s.color }}>{s.count}</span>
                      <span style={{ color: C.TEXT_HINT }}> ({p}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${p}%`, height: '100%', background: s.color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tier breakdown */}
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '14px 16px', border: '0.5px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 9, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Tier Breakdown</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tier', 'Apps', 'Covered', 'Dark', 'Avg Score'].map(h => (
                  <th key={h} style={{
                    fontSize: 8, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.08em',
                    textAlign: h === 'Tier' ? 'left' : 'right', paddingBottom: 7, fontWeight: 400,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tierStats.map(ts => (
                <tr key={ts.tier} style={{ borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '5px 0' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: tierAccents[ts.tier] }}>T{ts.tier}</span>
                  </td>
                  <td style={{ padding: '5px 0', fontSize: 9.5, color: C.TEXT_PRIMARY, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{ts.count}</td>
                  <td style={{ padding: '5px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: 9.5, color: C.DT_GREEN }}>{ts.covered}</span>
                    <span style={{ fontSize: 8.5, color: C.TEXT_HINT }}> ({ts.covPct}%)</span>
                  </td>
                  <td style={{ padding: '5px 0', fontSize: 9.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ts.dark > 0 ? C.DT_RED : C.TEXT_MUTED }}>{ts.dark}</td>
                  <td style={{ padding: '5px 0', textAlign: 'right' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 500, color: obsColor(ts.avgScore), fontVariantNumeric: 'tabular-nums' }}>{ts.avgScore}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ObservabilityHealth page
// ---------------------------------------------------------------------------

export function ObservabilityHealth() {
  // Single master query — entity-first, all signals joined server-side.
  const { data: masterData, isLoading: masterLoading } = useDql(
    { query: MASTER_QUERY, maxResultRecords: 100000, defaultScanLimitGbytes: -1 },
    { staleTime: 0 },
  );
  const { data: orphanData, isLoading: orphanLoading } = useDql(
    { query: ORPHAN_QUERY, maxResultRecords: 100000, defaultScanLimitGbytes: -1 },
    { staleTime: 0 },
  );

  // Build HealthRows directly from master query — no JS join needed.
  const healthRows = React.useMemo(() => {
    const rows: HealthRow[] = [];
    for (const rec of (masterData?.records ?? []) as unknown as MasterRec[]) {
      const hasAgent  = Number(rec.host_count) > 0;
      const fullStack = Number(rec.fullstack_count) > 0;
      const hasTraces = rec.svc_count  != null && Number(rec.svc_count)  > 0;
      const hasLogs   = rec.log_count  != null && Number(rec.log_count)  > 0;
      const hasRum    = rec.rum_active === true;

      const sigs  = [hasAgent, hasTraces, hasLogs, hasRum].filter(Boolean).length;
      const gaps  = 4 - sigs;
      const obsScore = sigs * 25;

      const t           = tierKey(rec.tier ?? '');
      const activeProbs = rec.active_probs != null ? Number(rec.active_probs) : 0;
      const probs24h    = rec.probs_24h   != null ? Number(rec.probs_24h)    : 0;
      const blast       = rec.blast != null ? Number(rec.blast) : 0;
      const deps        = rec.deps  != null ? Number(rec.deps)  : 0;

      const priority = gaps * 10
        + (blast > 30 ? 5 : 0)
        + (activeProbs > 0 ? 3 : 0)
        + (t === '1' ? 2 : 0);

      rows.push({
        appci:  rec.applicationci,
        name:   rec.ciname ?? rec.applicationci.toUpperCase(),
        tier:   t,
        owner:  rec.app_owner_name ?? '',
        hasAgent, fullStack, hasTraces, hasLogs, hasRum,
        sigs, gaps, obsScore, activeProbs, probs24h, blast, deps, priority,
      });
    }
    return rows;
  }, [masterData]);

  // Stats from orphaned query
  const orphanStats = React.useMemo(() => {
    const records = (orphanData?.records ?? []) as unknown as OrphanRec[];
    let total = 0, active = 0, closedDurSum = 0, closedCount = 0;
    for (const r of records) {
      total += Number(r.total);
      if (r['event.status'] === 'ACTIVE') active += Number(r.total);
      if (r['event.status'] === 'CLOSED' && r.avg_dur_ns != null) {
        closedDurSum += Number(r.avg_dur_ns) * Number(r.total);
        closedCount  += Number(r.total);
      }
    }
    return { total, active, avgDurNs: closedCount > 0 ? closedDurSum / closedCount : null };
  }, [orphanData?.records]);

  // Stats bar — derived from healthRows (entity-based, not CMDB count)
  const t1Count  = healthRows.filter(r => r.tier === '1').length;
  const t2Count  = healthRows.filter(r => r.tier === '2').length;
  const gapCount  = healthRows.filter(r => r.gaps > 0).length;
  const darkCount = healthRows.filter(r => r.sigs === 0).length;

  const STAT_CELLS = [
    { label: 'T1 Apps',        value: masterLoading ? '…' : String(t1Count),            accent: C.DT_RED },
    { label: 'T2 Apps',        value: masterLoading ? '…' : String(t2Count),            accent: C.DT_AMBER },
    { label: 'Apps with Gaps', value: masterLoading ? '…' : String(gapCount),           accent: C.DT_AMBER },
    { label: 'Fully Dark',     value: masterLoading ? '…' : String(darkCount),          accent: C.DT_RED },
    { label: 'Orphaned (7d)',  value: orphanLoading ? '…' : String(orphanStats.total),  accent: C.TEXT_PRIMARY },
    { label: 'Active Orphaned',value: orphanLoading ? '…' : String(orphanStats.active), accent: orphanStats.active > 0 ? C.DT_RED : C.DT_GREEN },
  ];

  return (
    <div>
      {/* Stats bar */}
      <div style={{ background: '#060E1C', display: 'flex', borderBottom: '0.5px solid rgba(255,255,255,0.07)', minHeight: 48 }}>
        {STAT_CELLS.map((cell, i) => (
          <div key={cell.label} style={{
            flex: 1, padding: '8px 20px',
            borderRight: i < STAT_CELLS.length - 1 ? '0.5px solid rgba(255,255,255,0.07)' : 'none',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: cell.accent, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {cell.value}
            </span>
            <span style={{ fontSize: 8.5, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {cell.label}
            </span>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>

        {/* Orphaned card */}
        <OrphanedCard orphanData={orphanStats} loading={orphanLoading} />

        {/* Extension Infrastructure */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 9, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Extension Infrastructure — Topology Gap
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {EXT_CARDS.map(card => <ExtCard key={card.name} card={card} />)}
          </div>
        </div>

        {/* Smartscape 2.0 */}
        <Smartscape2Callout />

        {/* Coverage Table */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 9, color: C.TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            App Coverage Table
          </div>
          <div style={{ fontSize: 8.5, color: C.TEXT_HINT, marginBottom: 8 }}>
            <span style={{ color: C.DT_GREEN, marginRight: 10 }}>■ All signals</span>
            <span style={{ color: C.DT_AMBER, marginRight: 10 }}>■ Gaps — no active problems</span>
            <span style={{ color: C.DT_RED }}>■ Gaps + active problems</span>
          </div>
          <CoverageTable rows={healthRows} loading={masterLoading} />
        </div>

        {/* Owner chart */}
        <OwnerChart rows={healthRows} />

        {/* Instrumentation Roadmap */}
        <InstrumentRoadmap />

        {/* Portfolio Insight */}
        <PortfolioInsightTile rows={healthRows} />

      </div>
    </div>
  );
}
