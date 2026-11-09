import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { deleteStack, deleteTake, listStacks, listTakes, saveStack, saveTake, type StoredStack, type StoredTake } from './audio/db';
import { engine } from './audio/engine';
import { playback } from './audio/playback';
import { disposeDecodeCtx } from './audio/render';
import { DEFAULT_TEMPLATE_ID, NEUTRAL_LEVELS, type Levels } from './templates';

export type Tab = 'record' | 'mix';
export type PlayerSource = { kind: 'blob'; blob: Blob } | { kind: 'buffer'; buffer: AudioBuffer };

interface SessionCtx {
  tab: Tab;
  setTab: (t: Tab) => void;
  templateId: string;
  setTemplateId: (id: string) => void;
  levels: Levels;
  setLevels: (l: Levels) => void;
  takes: StoredTake[];
  refreshTakes: () => Promise<void>;
  persistTake: (t: StoredTake) => Promise<void>;
  removeTake: (id: string) => Promise<void>;
  stacks: StoredStack[];
  refreshStacks: () => Promise<void>;
  persistStack: (s: StoredStack) => Promise<void>;
  removeStack: (id: string) => Promise<void>;
  /** currently playing take id or 'preview' or null */
  playingKey: string | null;
  playBlob: (key: string, blob: Blob) => Promise<void>;
  playBuffer: (key: string, buffer: AudioBuffer) => Promise<void>;
  stopPlayback: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('record');
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [levels, setLevels] = useState<Levels>(NEUTRAL_LEVELS);
  const [takes, setTakes] = useState<StoredTake[]>([]);
  const [stacks, setStacks] = useState<StoredStack[]>([]);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const refreshTakes = useCallback(async () => {
    try {
      setTakes(await listTakes());
    } catch {
      /* storage unavailable */
    }
  }, []);

  const refreshStacks = useCallback(async () => {
    try {
      setStacks(await listStacks());
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    void refreshTakes();
    void refreshStacks();
    return () => {
      playback.stop();
      void playback.dispose();
      void engine.dispose();
      void disposeDecodeCtx();
    };
  }, [refreshTakes, refreshStacks]);

  const persistTake = useCallback(async (t: StoredTake) => {
    await saveTake(t);
    await refreshTakes();
  }, [refreshTakes]);

  const removeTake = useCallback(async (id: string) => {
    await deleteTake(id);
    await refreshTakes();
  }, [refreshTakes]);

  const persistStack = useCallback(async (s: StoredStack) => {
    await saveStack(s);
    await refreshStacks();
  }, [refreshStacks]);

  const removeStack = useCallback(async (id: string) => {
    await deleteStack(id);
    await refreshStacks();
  }, [refreshStacks]);

  const playBlob = useCallback(async (key: string, blob: Blob) => {
    await playback.playBlob(blob, () => setPlayingKey(null));
    setPlayingKey(key);
  }, []);

  const playBuffer = useCallback(async (key: string, buffer: AudioBuffer) => {
    await playback.playBuffer(buffer, () => setPlayingKey(null));
    setPlayingKey(key);
  }, []);

  const stopPlayback = useCallback(() => {
    playback.stop();
    setPlayingKey(null);
  }, []);

  const value = useMemo<SessionCtx>(() => ({
    tab, setTab, templateId, setTemplateId, levels, setLevels,
    takes, refreshTakes, persistTake, removeTake,
    stacks, refreshStacks, persistStack, removeStack,
    playingKey, playBlob, playBuffer, stopPlayback,
  }), [tab, templateId, levels, takes, stacks, playingKey,
    refreshTakes, persistTake, removeTake,
    refreshStacks, persistStack, removeStack,
    playBlob, playBuffer, stopPlayback]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession outside provider');
  return ctx;
}
