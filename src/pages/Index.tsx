import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

declare global {
  interface Window {
    AndroidBridge?: { getVoltage: () => number; getGpsKm: () => number; saveData: (json: string) => void; loadData: () => string; };
    onVoltageUpdate?: (v: number) => void;
    onGpsKmUpdate?: (km: number) => void;
  }
}

interface Service {
  id: string; name: string; icon: string;
  intervalHours: number; intervalKm: number;
  lastHours: number; lastKm: number;
}
interface HistoryItem {
  id: string; service: string; date: string; hours: number; km: number;
}

const VOLTAGE_THRESHOLD = 14;
const IS_ANDROID = typeof window !== 'undefined' && !!window.AndroidBridge;

const DEFAULT_SERVICES: Service[] = [
  { id: 'oil',       name: 'Моторное масло',       icon: 'Droplet',  intervalHours: 250, intervalKm: 10000, lastHours: 0, lastKm: 0 },
  { id: 'filter_eng',name: 'Фильтр двигателя',     icon: 'Wind',     intervalHours: 500, intervalKm: 20000, lastHours: 0, lastKm: 0 },
  { id: 'filter_cab',name: 'Фильтр салона',        icon: 'AirVent',  intervalHours: 500, intervalKm: 15000, lastHours: 0, lastKm: 0 },
  { id: 'brakes',    name: 'Тормозные колодки',    icon: 'Disc3',    intervalHours: 750, intervalKm: 30000, lastHours: 0, lastKm: 0 },
];

function loadState() {
  try {
    const raw = IS_ANDROID ? window.AndroidBridge!.loadData() : localStorage.getItem('car_service_data');
    if (raw) return JSON.parse(raw);
  } catch (e) { void e; }
  return null;
}
function saveState(data: object) {
  const json = JSON.stringify(data);
  if (IS_ANDROID) { window.AndroidBridge!.saveData(json); } else { localStorage.setItem('car_service_data', json); }
}

type Screen = 'main' | 'oil' | 'filter_eng' | 'filter_cab' | 'brakes' | 'voltage' | 'history' | 'settings';

const MENU_ITEMS: { id: Screen; label: string; icon: string }[] = [
  { id: 'oil',        label: 'Моторное масло',    icon: 'Droplet' },
  { id: 'filter_eng', label: 'Фильтр двигателя',  icon: 'Wind' },
  { id: 'filter_cab', label: 'Фильтр салона',     icon: 'AirVent' },
  { id: 'brakes',     label: 'Тормозные колодки', icon: 'Disc3' },
  { id: 'voltage',    label: 'Напряжение сети',   icon: 'Zap' },
  { id: 'history',    label: 'История замен',      icon: 'History' },
  { id: 'settings',   label: 'Показания',          icon: 'SlidersHorizontal' },
];

export default function Index() {
  const saved = loadState();

  const [engineHours, setEngineHours] = useState<number>(saved?.engineHours ?? 0);
  const [totalKm, setTotalKm]         = useState<number>(saved?.totalKm ?? 0);
  const [services, setServices]       = useState<Service[]>(saved?.services ?? DEFAULT_SERVICES);
  const [history, setHistory]         = useState<HistoryItem[]>(saved?.history ?? []);
  const [voltage, setVoltage]         = useState<number>(12.4);
  const [screen, setScreen]           = useState<Screen>('main');
  const engineRunning                 = voltage >= VOLTAGE_THRESHOLD;
  const secondsRef                    = useRef<number>(0);
  const [hoursInput, setHoursInput]   = useState(String(saved?.engineHours ?? 0));
  const [kmInput, setKmInput]         = useState(String(saved?.totalKm ?? 0));

  useEffect(() => {
    if (IS_ANDROID) {
      window.onVoltageUpdate = (v) => setVoltage(v);
      window.onGpsKmUpdate   = (km) => setTotalKm(km);
      return () => { window.onVoltageUpdate = undefined; window.onGpsKmUpdate = undefined; };
    } else {
      const id = setInterval(() => {
        setVoltage(parseFloat((Math.random() > 0.3 ? 14.1 + Math.random() * 0.4 : 12.3 + Math.random() * 0.4).toFixed(1)));
      }, 5000);
      return () => clearInterval(id);
    }
  }, []);

  const totalKmRef  = useRef(totalKm);
  const servicesRef = useRef(services);
  const historyRef  = useRef(history);
  useEffect(() => { totalKmRef.current = totalKm; }, [totalKm]);
  useEffect(() => { servicesRef.current = services; }, [services]);
  useEffect(() => { historyRef.current = history; }, [history]);

  useEffect(() => {
    if (!engineRunning) return;
    const id = setInterval(() => {
      secondsRef.current += 1;
      if (secondsRef.current >= 3600) {
        secondsRef.current -= 3600;
        setEngineHours((h) => {
          const next = h + 1;
          saveState({ engineHours: next, totalKm: totalKmRef.current, services: servicesRef.current, history: historyRef.current });
          return next;
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [engineRunning]);

  useEffect(() => {
    saveState({ engineHours, totalKm, services, history });
  }, [engineHours, totalKm, services, history]);

  const resetService = (s: Service) => {
    setServices((prev) => prev.map((x) => x.id === s.id ? { ...x, lastHours: engineHours, lastKm: totalKm } : x));
    setHistory((prev) => [{ id: `h${Date.now()}`, service: s.name, date: new Date().toLocaleDateString('ru-RU'), hours: engineHours, km: totalKm }, ...prev]);
  };

  const getProgress = (s: Service) => Math.min(Math.max(Math.max(
    (engineHours - s.lastHours) / s.intervalHours,
    (totalKm - s.lastKm) / s.intervalKm
  ), 0), 1);

  const oil = services.find(s => s.id === 'oil')!;
  const oilProgress = getProgress(oil);
  const oilDanger   = oilProgress >= 0.85;

  return (
    <div className="relative w-full h-full flex overflow-hidden select-none" style={{ background: '#080808' }}>

      {/* Фоновые горизонтальные линии на весь экран */}
      <div className="perspective-lines" />

      {/* Левая панель */}
      <div className="left-panel relative z-10 flex flex-col" style={{ width: 220, minWidth: 220 }}>

        {/* Логотип/заголовок */}
        <div className="px-4 pt-5 pb-3 border-b border-white/5">
          <div className="font-display text-xs tracking-[0.25em] uppercase text-white/30 mb-1">Бортовой</div>
          <div className="font-display text-lg tracking-[0.15em] uppercase text-white/80">
            Сервис<span className="text-primary">·</span>Авто
          </div>
        </div>

        {/* Напряжение */}
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
          <Icon name={engineRunning ? 'Zap' : 'ZapOff'} size={14} className={engineRunning ? 'text-primary' : 'text-white/25'} />
          <span className="text-[11px] tracking-widest uppercase" style={{ color: engineRunning ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)' }}>
            {engineRunning ? 'Двигатель' : 'Стоянка'}
          </span>
          <span className={`ml-auto font-display text-sm ${engineRunning ? 'text-primary' : 'text-white/25'}`}>
            {voltage.toFixed(1)}В
          </span>
        </div>

        {/* Меню */}
        <nav className="flex-1 py-2">
          {MENU_ITEMS.map((item) => {
            const svc = services.find(s => s.id === item.id);
            const prog = svc ? getProgress(svc) : null;
            const warn = prog !== null && prog >= 0.85;
            return (
              <div
                key={item.id}
                className={`menu-row ${screen === item.id ? 'active' : ''}`}
                onClick={() => setScreen(item.id)}
              >
                <Icon name={item.icon} size={15} className={warn ? 'text-primary' : screen === item.id ? 'text-white/80' : 'text-white/30'} />
                <span className="label">{item.label}</span>
                {warn && <span className="text-primary text-[10px] font-display tracking-wider">!</span>}
                {prog !== null && (
                  <span className={`text-[11px] font-display ${warn ? 'text-primary' : 'text-white/30'}`}>
                    {Math.round(prog * 100)}%
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        {/* Моточасы и пробег внизу */}
        <div className="border-t border-white/5 px-4 py-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] tracking-widest uppercase text-white/30">Моточасы</span>
            <span className="font-display text-sm text-white/70">{engineHours.toLocaleString('ru-RU')} ч</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] tracking-widest uppercase text-white/30">GPS пробег</span>
            <span className="font-display text-sm text-white/70">{totalKm.toLocaleString('ru-RU')} км</span>
          </div>
        </div>
      </div>

      {/* Центральная область */}
      <div className="relative flex-1 flex flex-col overflow-hidden">

        {/* Красная полоса — точно как на картинке */}
        <div className="relative z-20 mt-[42px]">
          <div className="red-stripe animate-glow-pulse" />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginTop: 3 }} />
        </div>

        {/* Основной контент: диск слева + раздел справа */}
        <div className="flex-1 flex items-center z-10 relative px-6 gap-8">

          {/* ДИСК — кнопка возврата на главный экран */}
          <div
            className={`disc-btn ${screen === 'main' ? 'active' : ''}`}
            onClick={() => setScreen('main')}
          >
            <span className="disc-icon">
              <Icon name="Home" size={20} className="text-white/60" />
            </span>
          </div>

          {/* Разделитель */}
          <div style={{ width: 1, height: 200, background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 70%, transparent)' }} />

          {/* Правый контент — зависит от screen */}
          <div className="flex-1 h-full flex flex-col justify-center py-6 animate-fade-in" key={screen}>
            {screen === 'main' && <MainScreen engineHours={engineHours} totalKm={totalKm} engineRunning={engineRunning} voltage={voltage} services={services} getProgress={getProgress} />}
            {(screen === 'oil' || screen === 'filter_eng' || screen === 'filter_cab' || screen === 'brakes') && (
              <ServiceScreen
                service={services.find(s => s.id === screen)!}
                engineHours={engineHours}
                totalKm={totalKm}
                progress={getProgress(services.find(s => s.id === screen)!)}
                onReset={() => resetService(services.find(s => s.id === screen)!)}
              />
            )}
            {screen === 'voltage' && <VoltageScreen voltage={voltage} engineRunning={engineRunning} />}
            {screen === 'history' && <HistoryScreen history={history} />}
            {screen === 'settings' && (
              <SettingsScreen
                hoursInput={hoursInput} setHoursInput={setHoursInput}
                kmInput={kmInput} setKmInput={setKmInput}
                onSave={() => { setEngineHours(Number(hoursInput) || 0); setTotalKm(Number(kmInput) || 0); }}
                services={services} setServices={setServices}
              />
            )}
          </div>
        </div>

        {/* Нижние линии (сходятся к правому краю — как на картинке) */}
        <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: '60%', height: '45%' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              bottom: `${i * 14}px`,
              left: 0, right: 0,
              height: 1,
              background: `linear-gradient(90deg, transparent, rgba(255,255,255,${0.015 + i * 0.004}) 30%, rgba(255,255,255,${0.03 + i * 0.005}))`,
              transform: `perspective(600px) rotateX(${i * 2}deg)`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Главный экран ─────────────────────────────────────────── */
function MainScreen({ engineHours, totalKm, engineRunning, voltage, services, getProgress }: {
  engineHours: number; totalKm: number; engineRunning: boolean; voltage: number;
  services: Service[]; getProgress: (s: Service) => number;
}) {
  const ICONS: Record<string, string> = { oil: 'Droplet', filter_eng: 'Wind', filter_cab: 'AirVent', brakes: 'Disc3' };

  return (
    <div className="flex flex-col gap-4 h-full justify-center">

      {/* Три карточки сервиса — горизонтально */}
      <div className="font-display text-[10px] tracking-[0.3em] uppercase text-white/25">Состояние обслуживания</div>
      <div className="flex gap-3">
        {services.map(s => {
          const p      = getProgress(s);
          const danger = p >= 0.85;
          const warn   = p >= 0.65 && !danger;
          const remainH = Math.max(s.intervalHours - (engineHours - s.lastHours), 0);
          const remainK = Math.max(s.intervalKm - (totalKm - s.lastKm), 0);
          return (
            <div key={s.id} style={{
              flex: 1,
              padding: '12px 14px',
              border: `1px solid ${danger ? 'rgba(200,20,20,0.4)' : warn ? 'rgba(200,20,20,0.15)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 10,
              background: danger ? 'rgba(100,0,0,0.12)' : 'rgba(255,255,255,0.02)',
              boxShadow: danger ? '0 0 20px rgba(180,0,0,0.15)' : 'none',
            }}>
              {/* Иконка + название */}
              <div className="flex items-center gap-2 mb-3">
                <Icon name={ICONS[s.id] ?? 'Wrench'} size={14}
                  className={danger ? 'text-primary' : warn ? 'text-orange-500/70' : 'text-white/30'} />
                <span className="font-display text-[11px] tracking-widest uppercase"
                  style={{ color: danger ? '#e82020' : 'rgba(255,255,255,0.55)' }}>
                  {s.name}
                </span>
              </div>

              {/* Прогресс-бар */}
              <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginBottom: 10 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${p * 100}%`,
                  background: danger
                    ? 'linear-gradient(90deg, #7a0000, #e82020)'
                    : warn
                    ? 'linear-gradient(90deg, #5a2000, #c05010)'
                    : 'linear-gradient(90deg, #2a2a2a, #606060)',
                  boxShadow: danger ? '0 0 10px rgba(220,20,20,0.8)' : 'none',
                  transition: 'width 0.5s ease',
                }} />
              </div>

              {/* Процент */}
              <div className="font-display text-2xl tracking-wide mb-1"
                style={{ color: danger ? '#e82020' : warn ? '#c05010' : 'rgba(255,255,255,0.7)' }}>
                {Math.round(p * 100)}<span style={{ fontSize: 12, opacity: 0.6 }}>%</span>
              </div>

              {/* Остаток */}
              <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 10, fontFamily: 'Roboto, sans-serif', letterSpacing: '0.05em' }}>
                {remainH} ч · {remainK.toLocaleString('ru-RU')} км
              </div>

              {/* Статус */}
              {danger && (
                <div style={{ marginTop: 8, color: '#e82020', fontSize: 10, fontFamily: 'Oswald, sans-serif', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                  ⚠ Требует замены
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Нижняя строка: моточасы, пробег, напряжение */}
      <div className="flex gap-3 mt-1">
        <MiniStat label="Моточасы"   value={`${engineHours.toLocaleString('ru-RU')} ч`}   active={engineRunning} />
        <MiniStat label="GPS пробег" value={`${totalKm.toLocaleString('ru-RU')} км`} />
        <MiniStat label="Напряжение" value={`${voltage.toFixed(1)} В`} active={engineRunning} dim={!engineRunning} />
        <MiniStat label="Двигатель"  value={engineRunning ? 'Работает' : 'Стоп'}      active={engineRunning} dim={!engineRunning} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, active, dim }: { label: string; value: string; active?: boolean; dim?: boolean }) {
  return (
    <div style={{
      flex: 1, padding: '8px 12px',
      border: `1px solid ${active ? 'rgba(180,20,20,0.2)' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: 8,
      background: active ? 'rgba(80,0,0,0.06)' : 'rgba(255,255,255,0.015)',
    }}>
      <div style={{ fontSize: 9, fontFamily: 'Oswald,sans-serif', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 3 }}>{label}</div>
      <div className="font-display text-sm tracking-wide" style={{ color: dim ? 'rgba(255,255,255,0.2)' : active ? '#d05050' : 'rgba(255,255,255,0.7)' }}>{value}</div>
    </div>
  );
}

function StatBox({ label, value, active, warn }: { label: string; value: string; active?: boolean; warn?: boolean }) {
  return (
    <div style={{
      padding: '10px 14px',
      border: `1px solid ${active ? 'rgba(180,20,20,0.3)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 8,
      background: active ? 'rgba(120,0,0,0.06)' : 'rgba(255,255,255,0.02)',
    }}>
      <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</div>
      <div className="font-display text-base tracking-wide" style={{ color: warn ? 'rgba(255,255,255,0.25)' : active ? '#e06060' : 'rgba(255,255,255,0.75)' }}>{value}</div>
    </div>
  );
}

/* ── Экран сервиса ─────────────────────────────────────────── */
function ServiceScreen({ service, engineHours, totalKm, progress, onReset }: {
  service: Service; engineHours: number; totalKm: number; progress: number; onReset: () => void;
}) {
  const danger      = progress >= 0.85;
  const remainHours = Math.max(service.intervalHours - (engineHours - service.lastHours), 0);
  const remainKm    = Math.max(service.intervalKm - (totalKm - service.lastKm), 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="font-display text-[10px] tracking-[0.3em] uppercase text-white/30 mb-1">Обслуживание</div>
        <div className="font-display text-2xl tracking-wider uppercase" style={{ color: danger ? '#e82020' : 'rgba(255,255,255,0.85)' }}>
          {service.name}
        </div>
      </div>

      {/* Большой прогресс-бар */}
      <div>
        <div className="flex justify-between mb-2">
          <span className="text-[10px] tracking-widest uppercase text-white/30">Ресурс использован</span>
          <span className={`font-display text-lg ${danger ? 'text-primary' : 'text-white/60'}`}>{Math.round(progress * 100)}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${progress * 100}%`,
            background: danger ? 'linear-gradient(90deg, #7a0000, #e82020)' : 'linear-gradient(90deg, #2a2a2a, #666)',
            boxShadow: danger ? '0 0 12px rgba(220,20,20,0.8)' : 'none',
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoCell label="Осталось часов" value={`${remainHours} ч`} warn={danger} />
        <InfoCell label="Осталось км" value={`${remainKm.toLocaleString('ru-RU')} км`} warn={danger} />
        <InfoCell label="Интервал" value={`${service.intervalHours} ч`} />
        <InfoCell label="Интервал км" value={`${service.intervalKm.toLocaleString('ru-RU')} км`} />
      </div>

      <button
        onClick={onReset}
        style={{
          padding: '10px 24px',
          border: '1px solid rgba(180,20,20,0.5)',
          borderRadius: 8,
          background: 'rgba(120,0,0,0.12)',
          color: '#e06060',
          fontFamily: 'Oswald, sans-serif',
          fontSize: 12,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(180,0,0,0.2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(120,0,0,0.12)')}
      >
        ✓ Замена выполнена — сбросить
      </button>
    </div>
  );
}

function InfoCell({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ padding: '8px 12px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
      <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(255,255,255,0.28)' }}>{label}</div>
      <div className="font-display text-sm tracking-wide" style={{ color: warn ? '#e82020' : 'rgba(255,255,255,0.7)' }}>{value}</div>
    </div>
  );
}

/* ── Напряжение сети ───────────────────────────────────────── */
function VoltageScreen({ voltage, engineRunning }: { voltage: number; engineRunning: boolean }) {
  const status = engineRunning
    ? { label: 'Генератор работает', sub: 'Зарядка АКБ активна', color: '#e82020', glow: true }
    : voltage >= 12.4
    ? { label: 'АКБ заряжен', sub: 'Двигатель не работает', color: 'rgba(255,255,255,0.65)', glow: false }
    : { label: 'АКБ разряжается', sub: 'Низкое напряжение', color: '#c05010', glow: false };

  const bars = [
    { label: 'Критически низкое', range: '< 11.5 В',  min: 0,   max: 11.5 },
    { label: 'АКБ разряжен',      range: '11.5–12.0 В', min: 11.5, max: 12.0 },
    { label: 'АКБ заряжен',       range: '12.0–12.6 В', min: 12.0, max: 12.6 },
    { label: 'Норма (стоянка)',   range: '12.6–13.0 В', min: 12.6, max: 13.0 },
    { label: 'Генератор',         range: '13.0–14.5 В', min: 13.0, max: 14.5 },
    { label: 'Перезаряд',        range: '> 14.5 В',   min: 14.5, max: 16.0 },
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="font-display text-[10px] tracking-[0.3em] uppercase text-white/30 mb-1">Бортовая сеть</div>
        <div className="flex items-end gap-3">
          <span className="font-display tracking-wide" style={{ fontSize: 52, lineHeight: 1, color: status.color, textShadow: status.glow ? '0 0 20px rgba(220,20,20,0.6)' : 'none' }}>
            {voltage.toFixed(1)}
          </span>
          <span className="font-display text-xl text-white/30 mb-2">В</span>
        </div>
        <div className="mt-1">
          <div className="font-display text-sm tracking-wider uppercase" style={{ color: status.color }}>{status.label}</div>
          <div className="text-[11px] text-white/30 mt-0.5">{status.sub}</div>
        </div>
      </div>

      {/* Шкала напряжений */}
      <div className="space-y-2">
        {bars.map((b) => {
          const active = voltage >= b.min && voltage < b.max;
          return (
            <div key={b.label} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 12px', borderRadius: 7,
              border: `1px solid ${active ? 'rgba(200,20,20,0.35)' : 'rgba(255,255,255,0.05)'}`,
              background: active ? 'rgba(120,0,0,0.1)' : 'rgba(255,255,255,0.015)',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: active ? '#e82020' : 'rgba(255,255,255,0.15)',
                boxShadow: active ? '0 0 6px rgba(220,20,20,0.8)' : 'none',
                flexShrink: 0,
              }} />
              <span className="font-display text-xs tracking-wider uppercase flex-1" style={{ color: active ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)' }}>
                {b.label}
              </span>
              <span className="font-display text-xs" style={{ color: active ? '#e82020' : 'rgba(255,255,255,0.2)' }}>
                {b.range}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
      <div className="grid grid-cols-2 gap-3">
        <InfoCell label="Порог записи моточасов" value="≥ 14.0 В" />
        <InfoCell label="Источник данных" value={typeof window !== 'undefined' && !!window.AndroidBridge ? 'ACC/BAT' : 'Симуляция'} />
      </div>
    </div>
  );
}

/* ── История ───────────────────────────────────────────────── */
function HistoryScreen({ history }: { history: HistoryItem[] }) {
  return (
    <div>
      <div className="font-display text-[10px] tracking-[0.3em] uppercase text-white/30 mb-4">История замен</div>
      {history.length === 0 ? (
        <div className="text-sm text-white/25 tracking-wider">Замены ещё не выполнялись</div>
      ) : (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 280 }}>
          {history.map((h) => (
            <div key={h.id} style={{ padding: '8px 12px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="font-display text-sm tracking-wider text-white/75">{h.service}</div>
                <div className="text-[11px] text-white/30 mt-0.5">{h.date}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-xs text-white/45">{h.hours} ч</div>
                <div className="font-display text-xs text-white/30">{h.km.toLocaleString('ru-RU')} км</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Настройки ─────────────────────────────────────────────── */
function SettingsScreen({ hoursInput, setHoursInput, kmInput, setKmInput, onSave, services, setServices }: {
  hoursInput: string; setHoursInput: (v: string) => void;
  kmInput: string; setKmInput: (v: string) => void;
  onSave: () => void;
  services: Service[]; setServices: (fn: (prev: Service[]) => Service[]) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="font-display text-[10px] tracking-[0.3em] uppercase text-white/30">Корректировка показаний</div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] tracking-widest uppercase text-white/30 mb-2">Моточасы</div>
          <input
            value={hoursInput}
            onChange={e => setHoursInput(e.target.value)}
            inputMode="numeric"
            style={{
              width: '100%', padding: '8px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, color: 'rgba(255,255,255,0.8)',
              fontFamily: 'Oswald, sans-serif', fontSize: 16, letterSpacing: '0.05em',
              outline: 'none',
            }}
          />
        </div>
        <div>
          <div className="text-[10px] tracking-widest uppercase text-white/30 mb-2">Пробег GPS, км</div>
          <input
            value={kmInput}
            onChange={e => setKmInput(e.target.value)}
            inputMode="numeric"
            style={{
              width: '100%', padding: '8px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, color: 'rgba(255,255,255,0.8)',
              fontFamily: 'Oswald, sans-serif', fontSize: 16, letterSpacing: '0.05em',
              outline: 'none',
            }}
          />
        </div>
      </div>

      <div className="font-display text-[10px] tracking-[0.3em] uppercase text-white/30 pt-2">Интервалы замены</div>
      <div className="space-y-3">
        {services.map(s => (
          <div key={s.id} style={{ padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
            <div className="font-display text-xs tracking-wider text-white/50 uppercase mb-2">{s.name}</div>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-[9px] text-white/25 mb-1">Часы</div>
                <input
                  value={s.intervalHours}
                  onChange={e => setServices(prev => prev.map(x => x.id === s.id ? { ...x, intervalHours: Number(e.target.value) || x.intervalHours } : x))}
                  inputMode="numeric"
                  style={{ width: '100%', padding: '5px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontFamily: 'Oswald, sans-serif', fontSize: 13, outline: 'none' }}
                />
              </div>
              <div className="flex-1">
                <div className="text-[9px] text-white/25 mb-1">Км</div>
                <input
                  value={s.intervalKm}
                  onChange={e => setServices(prev => prev.map(x => x.id === s.id ? { ...x, intervalKm: Number(e.target.value) || x.intervalKm } : x))}
                  inputMode="numeric"
                  style={{ width: '100%', padding: '5px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontFamily: 'Oswald, sans-serif', fontSize: 13, outline: 'none' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onSave}
        style={{
          padding: '10px 28px',
          border: '1px solid rgba(180,20,20,0.5)',
          borderRadius: 8,
          background: 'rgba(120,0,0,0.15)',
          color: '#e06060',
          fontFamily: 'Oswald, sans-serif',
          fontSize: 12,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        Сохранить
      </button>
    </div>
  );
}