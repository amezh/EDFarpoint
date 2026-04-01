// Journal event store — receives events from Rust backend via Tauri IPC

export interface JournalEvent {
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

interface JournalState {
  commander: string | null;
  shipName: string | null;
  shipType: string | null;
  recentEvents: JournalEvent[];
}

function createJournalStore() {
  let state = $state<JournalState>({
    commander: null,
    shipName: null,
    shipType: null,
    recentEvents: [],
  });

  return {
    get commander() {
      return state.commander;
    },
    get shipName() {
      return state.shipName;
    },
    get recentEvents() {
      return state.recentEvents;
    },

    handleEvent(payload: unknown) {
      const ev = payload as JournalEvent;
      if (!ev?.event) return;

      // Keep last 200 events
      state.recentEvents = [ev, ...state.recentEvents].slice(0, 200);

      switch (ev.event) {
        case "Commander":
          state.commander = ev.Name as string;
          break;
        case "Loadout":
          state.shipName = ev.ShipName as string;
          state.shipType = ev.Ship as string;
          break;
      }
    },
  };
}

export const journalStore = createJournalStore();
