import { createContext, useContext, useReducer, useEffect } from "react";
import type { ReactNode } from "react";
import { createInitialState, reducer } from "./model";
import type { DemoState, Action } from "./model";
export * from "./model";
const KEY = "qinghe.health.demo.v1";
function validState(s: any) {
  return (
    s &&
    s.version === 1 &&
    Array.isArray(s.appointments) &&
    Array.isArray(s.patients) &&
    s.config &&
    typeof s.config === "object" &&
    Array.isArray(s.packages) &&
    Array.isArray(s.tasks) &&
    Array.isArray(s.audit) &&
    s.records &&
    typeof s.records === "object" &&
    s.appointments.every(
      (a: any) =>
        Array.isArray(a.items) && a.results && typeof a.results === "object",
    )
  );
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (validState(s)) return { ...createInitialState(), ...s };
    }
  } catch {}
  return createInitialState();
}
const Context = createContext<{
  state: DemoState;
  act: (action: Action) => void;
}>({ state: createInitialState(), act: () => {} });
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, act] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      console.warn("演示存储已满或不可用");
    }
  }, [state]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (validState(data)) act({ type: "SYNC", payload: data });
        } catch {}
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return <Context.Provider value={{ state, act }}>{children}</Context.Provider>;
}
export const useDemo = () => useContext(Context);
