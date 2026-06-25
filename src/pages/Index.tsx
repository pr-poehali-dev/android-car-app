import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

declare global {
  interface Window {
    AndroidBridge?: {
      getVoltage: () => number;
      getGpsKm: () => number;
      saveData: (json: string) => void;
      loadData: () => string;
    };
    onVoltageUpdate?: (v: number) => void;
    onGpsKmUpdate?: (km: number) => void;
  }
}

interface Service {
  id: string;
  name: string;
  icon: string;
  intervalHours: number;
  intervalKm: number;
  lastHours: number;
  lastKm: number;
}

interface HistoryItem {
  id: string;
  service: string;
  date: string;
  hours: number;
  km: number;
}

const VOLTAGE_THRESHOLD = 14;
const IS_ANDROID = typeof window !== 'undefined' && !!window.AndroidBridge;

const DEFAULT_SERVICES: Service[] = [
  { id: 'oil',    name: 'Моторное масло',    icon: 'Droplet', intervalHours: 250, intervalKm: 10000, lastHours: 0, lastKm: 0 },
  { id: 'filter', name: 'Воздушный фильтр',  icon: 'Wind',    intervalHours: 500, intervalKm: 20000, lastHours: 0, lastKm: 0 },
  { id: 'brakes', name: 'Тормозные колодки', icon: 'Disc',    intervalHours: 750, intervalKm: 30000, lastHours: 0, lastKm: 0 },
];

function loadState() {
  try {
    const raw = IS_ANDROID
      ? window.AndroidBridge!.loadData()
      : localStorage.getItem('car_service_data');
    if (raw) return JSON.parse(raw);
  } catch (e) { void e; }
  return null;
}

function saveState(data: object) {
  const json = JSON.stringify(data);
  if (IS_ANDROID) {
    window.AndroidBridge!.saveData(json);
  } else {
    localStorage.setItem('car_service_data', json);
  }
}

export default function Index() {
  const saved = loadState();

  const [engineHours, setEngineHours] = useState<number>(saved?.engineHours ?? 0);
  const [totalKm, setTotalKm]         = useState<number>(saved?.totalKm ?? 0);
  const [services, setServices]       = useState<Service[]>(saved?.services ?? DEFAULT_SERVICES);
  const [history, setHistory]         = useState<HistoryItem[]>(saved?.history ?? []);

  const [voltage, setVoltage]         = useState<number>(12.4);
  const engineRunning                 = voltage >= VOLTAGE_THRESHOLD;
  const secondsRef                    = useRef<number>(0);

  const [hoursInput, setHoursInput]   = useState(String(saved?.engineHours ?? 0));
  const [kmInput, setKmInput]         = useState(String(saved?.totalKm ?? 0));

  // Получаем напряжение: от Android через callback или polling
  useEffect(() => {
    if (IS_ANDROID) {
      // Android вызывает window.onVoltageUpdate(v) при каждом измерении
      window.onVoltageUpdate = (v: number) => setVoltage(v);
      window.onGpsKmUpdate   = (km: number) => setTotalKm(km);
      return () => {
        window.onVoltageUpdate = undefined;
        window.onGpsKmUpdate   = undefined;
      };
    } else {
      // В браузере — симуляция для разработки
      const id = setInterval(() => {
        const v = parseFloat((Math.random() > 0.3 ? 14.1 + Math.random() * 0.4 : 12.3 + Math.random() * 0.4).toFixed(1));
        setVoltage(v);
      }, 5000);
      return () => clearInterval(id);
    }
  }, []);

  // Refs для доступа к актуальным значениям внутри таймера без его перезапуска
  const totalKmRef   = useRef(totalKm);
  const servicesRef  = useRef(services);
  const historyRef   = useRef(history);
  useEffect(() => { totalKmRef.current = totalKm; }, [totalKm]);
  useEffect(() => { servicesRef.current = services; }, [services]);
  useEffect(() => { historyRef.current = history; }, [history]);

  // Считаем моточасы только при напряжении >= 14 В
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

  // Сохраняем данные при любом изменении
  useEffect(() => {
    saveState({ engineHours, totalKm, services, history });
  }, [engineHours, totalKm, services, history]);

  const saveCounters = () => {
    const h = Number(hoursInput) || 0;
    const k = Number(kmInput) || 0;
    setEngineHours(h);
    setTotalKm(k);
  };

  const resetService = (s: Service) => {
    setServices((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, lastHours: engineHours, lastKm: totalKm } : x)),
    );
    const today = new Date().toLocaleDateString('ru-RU');
    setHistory((prev) => [
      { id: `h${Date.now()}`, service: s.name, date: today, hours: engineHours, km: totalKm },
      ...prev,
    ]);
  };

  const getProgress = (s: Service) => {
    const byHours = (engineHours - s.lastHours) / s.intervalHours;
    const byKm    = (totalKm - s.lastKm) / s.intervalKm;
    return Math.min(Math.max(Math.max(byHours, byKm), 0), 1);
  };

  return (
    <div className="min-h-screen text-foreground px-5 py-6 md:px-10 md:py-8 max-w-5xl mx-auto">

      {/* Header */}
      <header className="animate-fade-in mb-8">
        <div className="glow-line w-full mb-6 animate-glow-pulse" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-wide uppercase">
              Сервис<span className="text-primary">·</span>Авто
            </h1>
            <p className="text-muted-foreground text-sm mt-1 font-light tracking-wider">
              Бортовой компьютер обслуживания
            </p>
          </div>
          <div className={`w-12 h-12 rounded-full border grid place-items-center transition-all ${
            engineRunning ? 'border-primary red-glow animate-glow-pulse' : 'border-border'
          }`}>
            <Icon name="Power" className={engineRunning ? 'text-primary' : 'text-muted-foreground'} size={22} />
          </div>
        </div>

        {/* Статус напряжения */}
        <div className="mt-5 rounded-2xl bg-card border border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon
              name={engineRunning ? 'Zap' : 'ZapOff'}
              size={20}
              className={engineRunning ? 'text-primary' : 'text-muted-foreground'}
            />
            <div>
              <p className="text-sm font-medium">
                {engineRunning ? 'Моточасы записываются' : 'Запись остановлена'}
              </p>
              <p className="text-xs text-muted-foreground">
                {IS_ANDROID
                  ? (engineRunning ? 'Генератор заряжает — двигатель работает' : 'Ожидание ACC/BAT ≥ 14.0 В')
                  : 'Браузер: симуляция (напр. меняется авто)'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-display text-2xl tracking-wide ${engineRunning ? 'text-primary' : 'text-muted-foreground'}`}>
              {voltage.toFixed(1)}<span className="text-sm ml-0.5">В</span>
            </p>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">порог 14.0 В</p>
          </div>
        </div>
      </header>

      {/* Счётчики */}
      <section className="grid grid-cols-2 gap-4 mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <CounterCard icon="Gauge"      label="Моточасы"   value={engineHours} unit="ч" />
        <CounterCard icon="Navigation" label="Пробег GPS" value={totalKm}     unit="км" />
        <Dialog>
          <DialogTrigger asChild>
            <button className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-2xl border border-border bg-card hover:border-primary/60 transition-colors text-sm tracking-wide">
              <Icon name="SlidersHorizontal" size={16} className="text-primary" />
              Скорректировать показания вручную
            </button>
          </DialogTrigger>
          <DialogContent className="bg-popover border-border">
            <DialogHeader>
              <DialogTitle className="font-display uppercase tracking-wide">Корректировка</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Моточасы</Label>
                <Input value={hoursInput} onChange={(e) => setHoursInput(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Пробег GPS, км</Label>
                <Input value={kmInput} onChange={(e) => setKmInput(e.target.value)} inputMode="numeric" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={saveCounters} className="w-full red-glow">Сохранить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      {/* Регламент */}
      <section className="mb-10 animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <SectionTitle icon="Wrench" title="Регламент обслуживания" />
        <div className="space-y-4">
          {services.map((s) => {
            const progress    = getProgress(s);
            const remainHours = Math.max(s.intervalHours - (engineHours - s.lastHours), 0);
            const remainKm    = Math.max(s.intervalKm - (totalKm - s.lastKm), 0);
            const danger      = progress >= 0.85;
            return (
              <div key={s.id} className="rounded-2xl bg-card border border-border p-5 red-glow">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl grid place-items-center border ${danger ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
                      <Icon name={s.icon} size={20} />
                    </div>
                    <div>
                      <p className="font-display text-lg tracking-wide">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Осталось {remainHours} ч · {remainKm.toLocaleString('ru-RU')} км
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => resetService(s)}
                    className="text-xs px-3 py-2 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                  >
                    Заменено
                  </button>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progress * 100}%`,
                      background: danger
                        ? 'linear-gradient(90deg, hsl(0 84% 45%), hsl(0 90% 55%))'
                        : 'linear-gradient(90deg, hsl(0 0% 35%), hsl(0 0% 55%))',
                      boxShadow: danger ? '0 0 12px hsla(0,84%,50%,0.7)' : 'none',
                    }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[11px] text-muted-foreground tracking-wider">
                  <span>{Math.round(progress * 100)}% ресурса</span>
                  <span>интервал {s.intervalHours} ч / {s.intervalKm.toLocaleString('ru-RU')} км</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* История */}
      <section className="animate-fade-in pb-8" style={{ animationDelay: '0.3s' }}>
        <SectionTitle icon="History" title="История замен" />
        {history.length === 0 ? (
          <div className="rounded-2xl bg-card border border-border p-8 text-center text-muted-foreground text-sm">
            История пока пуста — нажмите «Заменено» после первой замены
          </div>
        ) : (
          <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <Icon name="CheckCircle2" size={18} className="text-primary" />
                  <div>
                    <p className="text-sm">{h.service}</p>
                    <p className="text-xs text-muted-foreground">{h.date}</p>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{h.hours} ч</p>
                  <p>{h.km.toLocaleString('ru-RU')} км</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CounterCard({ icon, label, value, unit }: { icon: string; label: string; value: number; unit: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5 red-glow">
      <div className="flex items-center gap-2 text-muted-foreground text-xs tracking-widest uppercase mb-2">
        <Icon name={icon} size={14} className="text-primary" />
        {label}
      </div>
      <div className="font-display text-3xl md:text-4xl tracking-wide">
        {value.toLocaleString('ru-RU')}
        <span className="text-base text-muted-foreground ml-1 font-body">{unit}</span>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon name={icon} size={18} className="text-primary" />
      <h2 className="font-display text-xl tracking-wide uppercase">{title}</h2>
      <div className="flex-1 h-px bg-border ml-2" />
    </div>
  );
}