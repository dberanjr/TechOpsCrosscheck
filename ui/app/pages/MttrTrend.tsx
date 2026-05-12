import React from 'react';
import { useDql } from '@dynatrace-sdk/react-hooks';
import {
  Chart as ChartJS,
  CategoryScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Tooltip as ChartTooltip,
  Legend,
  ChartOptions,
  ChartData,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useCrosscheck } from '../context/CrosscheckContext';
import type { TechOpsRow } from '../lib/parseTechOpsCsv';

ChartJS.register(
  CategoryScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  ChartTooltip,
  Legend,
);

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

interface AppEntry {
  appci: string;
  label: string;
  color: string;
  dash: number[];
}

const LINE_DASHES = [
  [], [6, 3], [4, 2], [3, 3], [2, 4], [8, 2, 2, 2],
  [5, 5], [7, 2], [3, 6], [2, 2],
];

const ALL_COLORS = [
  DT_RED, DT_ORANGE, DT_AMBER, DT_PURPLE, DT_CYAN, DT_GREEN,
  DT_BLUE, DT_BLUE_LIGHT, DT_PINK, DT_MAGENTA,
];

type Range = '7d' | '30d' | '60d' | '90d' | '180d' | '365d';

const RANGE_CONFIG: Record<Range, { from: string; interval: string; label: string }> = {
  '7d':   { from: 'now()-7d',   interval: '12h', label: '7 days' },
  '30d':  { from: 'now()-30d',  interval: '1d',  label: '30 days' },
  '60d':  { from: 'now()-60d',  interval: '2d',  label: '60 days' },
  '90d':  { from: 'now()-90d',  interval: '3d',  label: '90 days' },
  '180d': { from: 'now()-180d', interval: '7d',  label: '180 days' },
  '365d': { from: 'now()-365d', interval: '14d', label: '1 year' },
};

const HALF_RANGES: Record<Range, string> = {
  '7d':   '84h',
  '30d':  '360h',
  '60d':  '720h',
  '90d':  '1080h',
  '180d': '2160h',
  '365d': '4380h',
};

const GOAL_HOURS = 5 / 60;

const Y_TICKS_HOURS = [
  36 / 3600, 6 / 60, 30 / 60,
  1, 2, 4, 8, 16, 32, 64,
];

function fmtHours(h: number): string {
  if (h < 1 / 60) return `${Math.round(h * 3600)}s`;
  if (h < 1)      return `${Math.round(h * 60)}m`;
  if (h < 24)     return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function dtTsToMs(ts: string): number {
  const cleaned = ts.replace(/(\.\d{3})\d+Z$/, '$1Z');
  return new Date(cleaned).getTime();
}

function abbrevOwner(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name.slice(0, 14);
  return `${parts[0][0]}. ${parts[parts.length - 1]}`.slice(0, 14);
}

function buildMttrQuery(appCIs: string[], from: string, interval: string): string {
  const appList = appCIs.map(a => `"${a}"`).join(', ');
  return `fetch dt.davis.problems, from:${from}
| filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
| filter event.status == "CLOSED" and isNotNull(resolved_problem_duration)
| fieldsAdd tags_str = toString(entity_tags)
| filter matchesPhrase(tags_str, "applicationci:")
| parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
| filter isNotNull(appci) and appci != ""
| fieldsAdd appci = lower(appci)
| filter in(appci, {${appList}})
| makeTimeseries avg_mttr_ns = avg(resolved_problem_duration), interval:${interval}, by:{appci}
| fieldsAdd avg_mttr_hours = avg_mttr_ns[] / 3600000000000`;
}

function buildRankingQuery(appCIs: string[], from: string, halfRange: string): string {
  const appList = appCIs.map(a => `"${a}"`).join(', ');
  return `fetch dt.davis.problems, from:${from}
| filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
| filter event.status == "CLOSED" and isNotNull(resolved_problem_duration)
| fieldsAdd tags_str = toString(entity_tags)
| filter matchesPhrase(tags_str, "applicationci:")
| parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
| filter isNotNull(appci) and appci != ""
| fieldsAdd appci = lower(appci)
| filter in(appci, {${appList}})
| fieldsAdd duration_h = toDouble(resolved_problem_duration) / 3600000000000
| summarize
    early_mttr = avg(if(timestamp < now()-${halfRange}, duration_h, else: null)),
    late_mttr = avg(if(timestamp >= now()-${halfRange}, duration_h, else: null)),
    problem_count = count(),
    by: appci
| filter isNotNull(early_mttr) and isNotNull(late_mttr)
| fieldsAdd delta_pct = (late_mttr - early_mttr) / early_mttr * 100`;
}

interface RankRecord {
  appci: string;
  early_mttr: number;
  late_mttr: number;
  problem_count: number;
  delta_pct: number;
}

function PillBtn({
  active, onClick, children, disabled, accent = DT_BLUE_LIGHT,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
  disabled?: boolean; accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 12px', borderRadius: 4,
        border: active ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.12)',
        background: active ? `${accent}18` : 'transparent',
        color: active ? accent : disabled ? 'rgba(255,255,255,0.2)' : TEXT_MUTED,
        fontSize: 11, fontWeight: active ? 500 : 400,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.12s',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

interface AppSelectorProps {
  selected: AppEntry[];
  pool: TechOpsRow[];
  onAdd: (app: AppEntry) => void;
  onRemove: (appci: string) => void;
}

function AppSelector({ selected, pool, onAdd, onRemove }: AppSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const dropRef = React.useRef<HTMLDivElement>(null);

  const selectedSet = new Set(selected.map(a => a.appci));

  const poolOptions = React.useMemo(() => {
    const q = search.toLowerCase();
    return pool
      .filter((rec) =>
        !selectedSet.has(rec.AppCI) &&
        (rec.AppCI.toLowerCase().includes(q) || rec.ApplicationName.toLowerCase().includes(q))
      )
      .slice(0, 20);
  }, [pool, search, selectedSet]);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const nextColor = ALL_COLORS[selected.length % ALL_COLORS.length];
  const nextDash  = LINE_DASHES[selected.length % LINE_DASHES.length];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {selected.map(app => (
        <div key={app.appci} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: `${app.color}18`, border: `0.5px solid ${app.color}55`,
          borderRadius: 4, padding: '3px 8px',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: app.color, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums' }}>
            {app.appci.toUpperCase()}
          </span>
          <span style={{ fontSize: 12, color: TEXT_MUTED, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {app.label}
          </span>
          <button onClick={() => onRemove(app.appci)}
            style={{ background: 'none', border: 'none', color: TEXT_HINT, cursor: 'pointer', padding: '0 2px', fontSize: 12, lineHeight: 1 }}>
            ×
          </button>
        </div>
      ))}

      {selected.length < 10 && (
        <div ref={dropRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.15)',
              borderRadius: 4, color: TEXT_MUTED, fontSize: 13, padding: '4px 10px', cursor: 'pointer',
            }}
          >
            + Add app
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 100,
              background: '#0C1826', border: '0.5px solid rgba(255,255,255,0.12)',
              borderRadius: 6, minWidth: 280, maxHeight: 240, overflowY: 'auto', marginTop: 4,
            }}>
              <input
                autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search AppCI or name…"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.04)', border: 'none',
                  borderBottom: '0.5px solid rgba(255,255,255,0.08)', color: TEXT_PRIMARY,
                  fontSize: 11, padding: '8px 12px', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {poolOptions.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 13, color: TEXT_HINT }}>No matching apps</div>
              ) : (
                poolOptions.map((rec) => (
                  <div key={rec.AppCI}
                    onClick={() => { onAdd({ appci: rec.AppCI.toLowerCase(), label: rec.ApplicationName, color: nextColor, dash: nextDash }); setOpen(false); setSearch(''); }}
                    style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY }}>{rec.AppCI.toUpperCase()}</span>
                    <span style={{ fontSize: 13, color: TEXT_MUTED, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rec.ApplicationName}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AppDelta {
  appci: string;
  label: string;
  color: string;
  pct: number | null;
  mttrThen: number | null;
  mttrNow: number | null;
}

function windowAvg(arr: number[], start: number, end: number): number {
  const slice = arr.slice(start, end);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function computeDelta(nonNull: number[]): { pct: number; mttrThen: number; mttrNow: number } | null {
  const win = Math.max(2, Math.min(5, Math.floor(nonNull.length * 0.20)));
  if (nonNull.length < win * 2) return null;
  const mttrThen = windowAvg(nonNull, 0, win);
  const mttrNow  = windowAvg(nonNull, nonNull.length - win, nonNull.length);
  const pct = ((mttrNow - mttrThen) / mttrThen) * 100;
  return { pct, mttrThen, mttrNow };
}

function DeltaBar({ deltas, range }: { deltas: AppDelta[]; range: Range }) {
  if (deltas.length === 0) return null;
  const rangeLabel = RANGE_CONFIG[range].label;

  return (
    <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)', marginTop: 16, paddingTop: 14 }}>
      <div style={{ fontSize: 11, color: TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.11em', marginBottom: 10 }}>
        Period change · {rangeLabel} · first 20% of buckets vs last 20%
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {deltas.map(d => {
          const noData   = d.pct === null;
          const improved = !noData && d.pct! < -1;
          const degraded = !noData && d.pct! > 1;
          const neutral  = !noData && !improved && !degraded;
          const accentColor = noData ? TEXT_HINT : improved ? DT_GREEN : degraded ? DT_RED : TEXT_MUTED;
          const arrow   = noData ? '—' : improved ? '↓' : degraded ? '↑' : '→';
          const pctAbs  = noData ? null : Math.abs(d.pct!);
          const pctText = noData ? 'no data' : neutral ? '~0%' : `${pctAbs!.toFixed(1)}%`;
          const caption = noData ? '' : improved ? 'improved' : degraded ? 'degraded' : 'flat';

          return (
            <div key={d.appci} style={{
              display: 'flex', alignItems: 'center', gap: 0,
              borderRadius: 5, overflow: 'hidden',
              border: `0.5px solid ${noData ? 'rgba(255,255,255,0.07)' : `${accentColor}40`}`,
              background: noData ? 'rgba(255,255,255,0.02)' : `${accentColor}0C`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRight: '0.5px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 7, height: 7, borderRadius: 1, background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY }}>{d.appci.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, padding: '6px 10px', borderRight: '0.5px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: 18, fontWeight: 500, color: accentColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {arrow} {pctText}
                </span>
                {caption && <span style={{ fontSize: 11, color: accentColor, opacity: 0.8 }}>{caption}</span>}
              </div>
              <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                {noData ? (
                  <span style={{ fontSize: 13, color: TEXT_HINT }}>insufficient data</span>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: TEXT_SECONDARY, fontVariantNumeric: 'tabular-nums' }}>{fmtHours(d.mttrThen!)}</span>
                    <span style={{ fontSize: 12, color: TEXT_HINT }}>then</span>
                    <span style={{ fontSize: 13, color: TEXT_HINT }}>→</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: improved ? DT_GREEN : degraded ? DT_RED : TEXT_SECONDARY, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtHours(d.mttrNow!)}
                    </span>
                    <span style={{ fontSize: 12, color: TEXT_HINT }}>now</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MttrRecord {
  appci: string;
  timeframe: { start: string; end: string };
  interval: string;
  avg_mttr_hours: (number | null)[];
}

interface MttrChartProps {
  apps: AppEntry[];
  range: Range;
}

function MttrChart({ apps, range }: MttrChartProps) {
  const { from, interval } = RANGE_CONFIG[range];
  const query = buildMttrQuery(apps.map(a => a.appci), from, interval);

  const { data, isLoading, error } = useDql(
    { query, maxResultRecords: 1000, defaultScanLimitGbytes: 500 },
    { staleTime: 0 },
  );

  const { chartData, recordCount, deltas } = React.useMemo(() => {
    const records = (data?.records ?? []) as unknown as MttrRecord[];
    if (records.length === 0) return {
      chartData: { datasets: [] } as ChartData<'line'>,
      recordCount: 0,
      deltas: [] as AppDelta[],
    };

    const firstRec = records[0];
    const startMs    = dtTsToMs(String(firstRec.timeframe?.start ?? ''));
    const intervalMs = Number(firstRec.interval) / 1_000_000;
    const bucketCount = firstRec.avg_mttr_hours?.length ?? 0;

    const labels = Array.from({ length: bucketCount }, (_, i) => {
      const d = new Date(startMs + i * intervalMs);
      if (range === '7d') {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
      }
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const appDeltas: AppDelta[] = [];

    const appDatasets = apps.map(app => {
      const rec = records.find(r => r.appci === app.appci);
      const values = (rec?.avg_mttr_hours ?? Array(bucketCount).fill(null)).map(
        v => (v != null && isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null)
      );
      const nonNull = values.filter((v): v is number => v !== null);
      const delta = computeDelta(nonNull);
      appDeltas.push({
        appci: app.appci, label: app.label, color: app.color,
        pct: delta?.pct ?? null, mttrThen: delta?.mttrThen ?? null, mttrNow: delta?.mttrNow ?? null,
      });
      return {
        label: `${app.appci.toUpperCase()} — ${app.label}`,
        data: values as number[],
        borderColor: app.color,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: app.dash,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: app.color,
        spanGaps: true,
      };
    });

    const goalDataset = {
      label: 'Zero MTTR Goal · Jan 1, 2027',
      data: Array(bucketCount).fill(GOAL_HOURS) as number[],
      borderColor: DT_GREEN,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [6, 4],
      tension: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      spanGaps: true,
    };

    return {
      chartData: { labels, datasets: [...appDatasets, goalDataset] } as ChartData<'line'>,
      recordCount: records.length,
      deltas: appDeltas,
    };
  }, [data?.records, apps, range]);

  const options = React.useMemo((): ChartOptions<'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 800 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true, position: 'top',
        labels: { color: TEXT_MUTED, font: { size: 10 }, boxWidth: 20, padding: 16 },
      },
      tooltip: {
        backgroundColor: '#0e1e34',
        borderColor: 'rgba(20,151,255,0.3)', borderWidth: 1,
        titleColor: TEXT_PRIMARY, bodyColor: TEXT_MUTED,
        padding: 10,
        callbacks: {
          label: (ctx) => {
            if (ctx.dataset.label?.startsWith('Zero MTTR Goal')) return undefined;
            const v = ctx.parsed.y;
            if (v == null || !isFinite(v) || v <= 0) return undefined;
            const name = ctx.dataset.label?.split(' — ')[0] ?? '';
            return ` ${name}: ${fmtHours(v)}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: TEXT_HINT, font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 },
        grid: { color: 'rgba(255,255,255,0.05)' },
        border: { color: 'rgba(255,255,255,0.08)' },
      },
      y: {
        type: 'logarithmic',
        min: Y_TICKS_HOURS[0],
        max: Y_TICKS_HOURS[Y_TICKS_HOURS.length - 1],
        ticks: {
          color: TEXT_HINT, font: { size: 9 },
          callback: (rawValue) => {
            const h = Number(rawValue);
            const closest = Y_TICKS_HOURS.find(t => Math.abs(t - h) / t < 0.01);
            return closest !== undefined ? fmtHours(h) : '';
          },
          includeBounds: false,
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        border: { color: 'rgba(255,255,255,0.08)' },
        title: { display: true, text: 'MTTR', color: TEXT_HINT, font: { size: 9 } },
      },
    },
  }), []);

  if (error) return <div style={{ padding: 20, color: DT_RED, fontSize: 11 }}>Query error — {error.message}</div>;

  const hasData = recordCount > 0;

  return (
    <div>
      <div style={{ position: 'relative', height: 340 }}>
        {isLoading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(6,13,24,0.7)', zIndex: 10, fontSize: 13, color: TEXT_HINT, letterSpacing: '0.06em',
          }}>
            QUERYING DYNATRACE INTELLIGENCE…
          </div>
        )}
        {!isLoading && !hasData && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <div style={{ fontSize: 11, color: TEXT_MUTED }}>No closed problems found for the selected apps in this time window.</div>
            <div style={{ fontSize: 13, color: TEXT_HINT }}>Try a wider range, or use + Add app to select apps from your CMDB.</div>
          </div>
        )}
        <Line data={chartData} options={options} />
      </div>
      {hasData && <DeltaBar deltas={deltas} range={range} />}
    </div>
  );
}

const TIER_LABELS: Record<string, string> = {
  '1': '1 - most critical',
  '2': '2 - somewhat critical',
  '3': '3 - less critical',
  '4': '4 - not critical',
};

export function MttrTrend() {
  const [range, setRange] = React.useState<Range>('30d');
  const [tier, setTier]   = React.useState<'1' | '2' | '3' | '4'>('1');
  const [owner, setOwner] = React.useState<string | null>(null);
  const [apps, setApps]   = React.useState<AppEntry[]>([]);
  const { applicationList, centralStatus } = useCrosscheck();
  const cmdbInitialized = React.useRef(false);

  const cmdb = React.useMemo(() => {
    const map = new Map<string, { ciname: string; app_owner_name: string; tier: string }>();
    for (const row of applicationList) {
      map.set(row.AppCI.toLowerCase(), {
        ciname: row.ApplicationName,
        app_owner_name: row.Director,
        tier: row.Tier,
      });
    }
    return map;
  }, [applicationList]);
  const cmdbLoading = centralStatus === 'loading';

  const tierPool = React.useMemo(() =>
    Array.from(applicationList).filter(r => r.Tier === TIER_LABELS[tier]),
    [applicationList, tier],
  );

  const filteredPool = React.useMemo(() =>
    owner ? tierPool.filter(r => r.Director === owner) : tierPool,
    [tierPool, owner],
  );

  const ownerList = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of tierPool) {
      if (r.Director) counts.set(r.Director, (counts.get(r.Director) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([n, c]) => ({ name: n, count: c }));
  }, [tierPool]);

  function makeDefaultApps(t: string, o: string | null): AppEntry[] {
    const tierLabel = TIER_LABELS[t] || t;
    return applicationList
      .filter(r => r.Tier === tierLabel && (!o || r.Director === o))
      .slice(0, 6)
      .map((r, i) => ({
        appci: r.AppCI.toLowerCase(),
        label: r.ApplicationName,
        color: ALL_COLORS[i % ALL_COLORS.length],
        dash: LINE_DASHES[i % LINE_DASHES.length],
      }));
  }

  React.useEffect(() => {
    if (cmdbLoading || applicationList.length === 0 || cmdbInitialized.current) return;
    cmdbInitialized.current = true;
    const initial = makeDefaultApps('1', null);
    if (initial.length > 0) setApps(initial);
  }, [applicationList, cmdbLoading]);

  function handleTierChange(newTier: '1' | '2' | '3' | '4') {
    setTier(newTier);
    setOwner(null);
    if (applicationList.length > 0) setApps(makeDefaultApps(newTier, null));
  }

  function handleOwnerChange(newOwner: string | null) {
    setOwner(newOwner);
    if (applicationList.length > 0) setApps(makeDefaultApps(tier, newOwner));
  }

  const poolCIs = filteredPool.map(r => r.AppCI.toLowerCase());

  const rankQuery = poolCIs.length > 0
    ? buildRankingQuery(poolCIs, RANGE_CONFIG[range].from, HALF_RANGES[range])
    : 'fetch dt.davis.problems, from:now()-1m | limit 0';

  const { data: rankData, isLoading: rankLoading } = useDql(
    { query: rankQuery, maxResultRecords: 500, defaultScanLimitGbytes: 500 },
    { staleTime: 0 },
  );

  function applyRanking(mode: 'leaders' | 'laggers') {
    const records = (rankData?.records ?? []) as unknown as RankRecord[];
    if (records.length === 0) return;
    const sorted = [...records].sort((a, b) => Number(a.delta_pct) - Number(b.delta_pct));
    const picked = mode === 'leaders' ? sorted.slice(0, 5) : [...sorted].reverse().slice(0, 5);
    setApps(picked.map((rec, i) => {
      const appciLower = String(rec.appci).toLowerCase();
      const label = cmdb.get(appciLower)?.ciname ?? appciLower.toUpperCase();
      return {
        appci: appciLower,
        label,
        color: ALL_COLORS[i % ALL_COLORS.length],
        dash: LINE_DASHES[i % LINE_DASHES.length],
      };
    }));
  }

  const daysRemaining = React.useMemo(() => {
    const target = new Date('2027-01-01T00:00:00Z').getTime();
    return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
  }, []);

  const scopeLabel = owner ? `T${tier} · ${owner}` : `All T${tier} apps`;

  const notebookDql = encodeURIComponent(
    `fetch dt.davis.problems, from:${RANGE_CONFIG[range].from}
| filter event.kind == "DAVIS_PROBLEM" AND dt.davis.is_duplicate == false
| filter event.status == "CLOSED" and isNotNull(resolved_problem_duration)
| fieldsAdd tags_str = toString(entity_tags)
| parse tags_str, """LD 'applicationci:' LD:appci '"' LD"""
| filter isNotNull(appci) and appci != ""
| fieldsAdd appci = lower(appci)
| filter in(appci, {${apps.map(a => `"${a.appci}"`).join(', ')}})
| makeTimeseries avg_mttr_ns = avg(resolved_problem_duration), interval:${RANGE_CONFIG[range].interval}, by:{appci}
| fieldsAdd avg_mttr_hours = avg_mttr_ns[] / 3600000000000`,
  );

  return (
    <div>
      {/* Stats bar */}
      <div style={{ background: '#060E1C', display: 'flex', borderBottom: '0.5px solid rgba(255,255,255,0.07)', minHeight: 48 }}>
        {[
          { label: 'Zero MTTR Goal',  value: 'Jan 1, 2027',           accent: DT_GREEN },
          { label: 'Days remaining',  value: String(daysRemaining),    accent: DT_AMBER },
          { label: 'Target MTTR',     value: '< 5 minutes',            accent: DT_CYAN },
          { label: 'Scope',           value: scopeLabel,                accent: TEXT_PRIMARY },
          { label: 'Current view',    value: RANGE_CONFIG[range].label, accent: TEXT_PRIMARY },
        ].map((cell, i, arr) => (
          <div key={cell.label} style={{
            flex: 1, padding: '8px 20px',
            borderRight: i < arr.length - 1 ? '0.5px solid rgba(255,255,255,0.07)' : 'none',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <span style={{ fontSize: 18, fontWeight: 500, color: cell.accent, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {cell.value}
            </span>
            <span style={{ fontSize: 11, color: TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {cell.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Tier + Owner filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
            Tier
          </span>
          {(['1', '2', '3', '4'] as const).map(t => (
            <PillBtn key={t} active={t === tier} onClick={() => handleTierChange(t)}>
              T{t}
            </PillBtn>
          ))}

          {ownerList.length > 0 && (
            <>
              <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 6px', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
                Director
              </span>
              <select
                value={owner ?? ''}
                onChange={e => handleOwnerChange(e.target.value || null)}
                style={{
                  background: '#0C1826',
                  border: `1px solid ${owner ? DT_BLUE_LIGHT : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 4,
                  color: owner ? DT_BLUE_LIGHT : TEXT_MUTED,
                  fontSize: 11,
                  padding: '4px 28px 4px 10px',
                  cursor: 'pointer',
                  outline: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                }}
              >
                <option value="">All directors</option>
                {ownerList.map(({ name, count }) => (
                  <option key={name} value={name}>{name} ({count})</option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* Leaders / Laggers quick select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
            Quick select
          </span>
          <PillBtn
            active={false}
            accent={DT_GREEN}
            disabled={rankLoading || poolCIs.length === 0}
            onClick={() => applyRanking('leaders')}
          >
            {rankLoading ? '↑ Leaders …' : '↑ Leaders'}
          </PillBtn>
          <PillBtn
            active={false}
            accent={DT_RED}
            disabled={rankLoading || poolCIs.length === 0}
            onClick={() => applyRanking('laggers')}
          >
            {rankLoading ? '↓ Laggers …' : '↓ Laggers'}
          </PillBtn>
          <span style={{ fontSize: 12, color: TEXT_HINT }}>
            · top 5 by MTTR delta · {RANGE_CONFIG[range].label} · {poolCIs.length} apps in pool
          </span>
        </div>

        {/* Range + Apps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10, borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
              Range
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(Object.keys(RANGE_CONFIG) as Range[]).map(r => (
                <PillBtn key={r} active={r === range} onClick={() => setRange(r)}>{r}</PillBtn>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 12, color: TEXT_HINT, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0, paddingTop: 6 }}>
              Apps
            </span>
            <AppSelector
              selected={apps}
              pool={filteredPool}
              onAdd={a => setApps(p => [...p, a])}
              onRemove={ci => setApps(p => p.filter(a => a.appci !== ci))}
            />
          </div>
        </div>

        {/* Chart card */}
        <div style={{ background: '#0C1826', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: DT_CYAN, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                MTTR Trend — Zero MTTR Goal Tracker
              </div>
              <div style={{ fontSize: 12, color: TEXT_HINT, marginTop: 2 }}>
                Average time-to-resolve · closed problems · log scale · {apps.length} app{apps.length === 1 ? '' : 's'} · {scopeLabel}
              </div>
            </div>
          </div>

          {apps.length === 0 ? (
            <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT_HINT, fontSize: 11 }}>
              {cmdbLoading ? 'Loading CMDB…' : 'Use + Add app or select Leaders / Laggers to begin'}
            </div>
          ) : (
            <MttrChart apps={apps} range={range} />
          )}
        </div>

        {/* Annotations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              border: `0.5px dashed ${DT_GREEN}88`, borderRadius: 4,
              padding: '4px 10px', background: `${DT_GREEN}0A`,
            }}>
              <div style={{ width: 20, borderBottom: `1.5px dashed ${DT_GREEN}` }} />
              <span style={{ fontSize: 13, color: DT_GREEN }}>
                Zero MTTR goal: Jan 1, 2027 · {daysRemaining} days remaining
              </span>
            </div>
            <a
              href={`https://ual.apps.dynatrace.com/ui/apps/dynatrace.notebooks?query=${notebookDql}`}
              target="_blank" rel="noreferrer"
              style={{ fontSize: 13, color: DT_BLUE_LIGHT, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
            >
              Open in Notebooks →
            </a>
          </div>
          <div style={{ fontSize: 13, color: TEXT_HINT }}>
            Representative averages from UAL production · log scale Y axis · hover any point to see formatted MTTR per app
          </div>
        </div>

      </div>
    </div>
  );
}
