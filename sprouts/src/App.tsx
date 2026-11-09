import { AudioLines, Layers, Mic } from 'lucide-react';
import { SessionProvider, useSession, type Tab } from '@/lib/session';
import { getTemplate } from '@/lib/templates';
import { RecordSection, RecordHalo } from '@/sections/RecordSection';
import { StemsSection } from '@/sections/StemsSection';
import { TakesSection } from '@/sections/TakesSection';
import { Toaster } from '@/components/ui/sonner';

const TABS: { id: Tab; label: string; icon: typeof Mic }[] = [
  { id: 'record', label: 'Booth', icon: Mic },
  { id: 'stems', label: 'Mixdown', icon: Layers },
  { id: 'takes', label: 'Vault', icon: AudioLines },
];

function Wordmark() {
  return (
    <h1 className="font-display text-xl font-medium tracking-tight text-foreground">
      SPROUTS
      <span className="text-primary">.</span>
      <span className="ml-2 align-middle font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/60">Produce</span>
    </h1>
  );
}

function TabNav({ className }: { className?: string }) {
  const { tab, setTab } = useSession();
  return (
    <nav className={className} aria-label="Studio sections">
      <div className="flex border border-border">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.2em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${
                active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Shell() {
  const { tab, setTab, templateId } = useSession();
  const template = getTemplate(templateId);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="lg:grid lg:grid-cols-[minmax(400px,42%)_1fr]">
        {/* Left / hero panel — the halo owns this space */}
        <aside className="flex flex-col border-b border-border lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-5 pt-5 lg:px-8 lg:pt-8">
            <Wordmark />
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Template</p>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.15em] text-primary">{template.short}</p>
            </div>
          </div>

          {tab === 'record' ? (
            <div className="relative min-h-[42dvh] flex-1 lg:min-h-0">
              <RecordHalo className="absolute inset-0 h-full w-full" />
            </div>
          ) : (
            <div className="hidden lg:block lg:relative lg:min-h-0 lg:flex-1">
              <RecordHalo className="absolute inset-0 h-full w-full opacity-40" />
            </div>
          )}

          <div className="hidden px-8 pb-8 lg:block">
            {tab === 'record' && (
              <p className="font-serif-accent text-lg italic leading-snug text-muted-foreground">
                Get your levels right — anywhere.
              </p>
            )}
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
              Dry in — master out · On-device · v0.1
            </p>
          </div>
        </aside>

        {/* Right / console column */}
        <main className="pb-28 lg:pb-12">
          <div className="mx-auto w-full max-w-2xl px-5 lg:px-10">
            <TabNav className="sticky top-0 z-10 -mx-5 hidden bg-background/90 px-5 py-4 backdrop-blur-sm lg:block" />
            <div className="pt-6 lg:pt-8">
              {tab === 'record' && <RecordSection />}
              {tab === 'stems' && <StemsSection />}
              {tab === 'takes' && <TakesSection />}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Studio sections"
      >
        <div className="grid grid-cols-3">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <t.icon className="h-5 w-5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: 'hsl(240 8% 7%)',
            border: '1px solid hsl(240 6% 16%)',
            color: 'hsl(40 20% 94%)',
            borderRadius: 0,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            letterSpacing: '0.08em',
          },
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
