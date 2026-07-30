import { gasApiClient } from "./gasApiClient.js";

const SESSION_STORAGE_KEY = "inventory-app-sessions-v1";
const RECORD_STORAGE_KEY = "inventory-app-records-v1";
const ACTIVE_SESSION_STORAGE_KEY = "inventory-app-active-session-v1";

const clone = (value) => structuredClone(value);

export class InventoryRepository {
  constructor() {
    this.sessions = [];
    this.records = [];
    this.activeSessionId = "";
    this.lastSyncError = "";
  }

  async initialize() {
    const localSessions = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const localRecords = window.localStorage.getItem(RECORD_STORAGE_KEY);
    const localActiveSessionId = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);

    if (localSessions && localRecords) {
      this.sessions = JSON.parse(localSessions);
      this.records = JSON.parse(localRecords);
      this.activeSessionId = localActiveSessionId ?? "";
    } else {
      try {
        const [sessionResponse, recordResponse] = await Promise.all([
          fetch("./src/assets/inventorySessions.json", { cache: "no-store" }),
          fetch("./src/assets/inventoryRecords.json", { cache: "no-store" })
        ]);

        if (!sessionResponse.ok || !recordResponse.ok) {
          throw new Error("failed to fetch inventory seed");
        }

        this.sessions = await sessionResponse.json();
        this.records = await recordResponse.json();
      } catch {
        this.sessions = [];
        this.records = [];
      }
    }

    if (gasApiClient.isEnabled()) {
      await this.pullFromGas();
    }

    this.persistSessions();
    this.persistRecords();
    this.persistActiveSessionId();
  }

  getActiveSession() {
    if (!this.activeSessionId) {
      return null;
    }

    return clone(this.sessions.find((session) => session.sessionId === this.activeSessionId));
  }

  findSessionByStoreDate(storeName, inventoryDate) {
    return clone(this.sessions.find((item) => item.storeName === storeName && item.inventoryDate === inventoryDate));
  }

  saveSession(session) {
    const index = this.sessions.findIndex((item) => item.sessionId === session.sessionId);
    if (index >= 0) {
      this.sessions[index] = clone(session);
    } else {
      this.sessions.push(clone(session));
    }

    this.activeSessionId = session.sessionId;
    this.persistSessions();
    this.persistActiveSessionId();

    if (gasApiClient.isEnabled()) {
      void gasApiClient
        .request({
          entity: "inventorySessions",
          action: "upsert",
          payload: { item: session }
        })
        .catch((error) => {
          this.lastSyncError = error instanceof Error ? error.message : "session sync failed";
        });
    }
  }

  getRecordsBySession(sessionId) {
    return clone(this.records.filter((record) => record.sessionId === sessionId));
  }

  getRecord(sessionId, productId, location) {
    return clone(
      this.records.find(
        (record) => record.sessionId === sessionId && record.productId === productId && record.location === location
      )
    );
  }

  upsertRecord(record) {
    const index = this.records.findIndex(
      (item) => item.sessionId === record.sessionId && item.productId === record.productId && item.location === record.location
    );

    if (index < 0) {
      this.records.push(clone(record));
      this.persistRecords();
      this.pushRecord(record);
      return { changed: true };
    }

    if (this.records[index].quantity === record.quantity) {
      return { changed: false };
    }

    this.records[index] = clone(record);
    this.persistRecords();
    this.pushRecord(record);
    return { changed: true };
  }

  nextSessionId() {
    const max = this.sessions.reduce((acc, item) => {
      const numeric = Number(item.sessionId.replace(/^S/, ""));
      return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
    }, 0);

    return `S${String(max + 1).padStart(6, "0")}`;
  }

  nextRecordId() {
    const max = this.records.reduce((acc, item) => {
      const numeric = Number(item.recordId.replace(/^R/, ""));
      return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
    }, 0);

    return `R${String(max + 1).padStart(6, "0")}`;
  }

  persistSessions() {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.sessions));
  }

  persistRecords() {
    window.localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(this.records));
  }

  persistActiveSessionId() {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, this.activeSessionId);
  }

  async pullFromGas() {
    try {
      const [remoteSessions, remoteRecords] = await Promise.all([
        gasApiClient.request({
          entity: "inventorySessions",
          action: "list",
          payload: {},
          cacheable: true
        }),
        gasApiClient.request({
          entity: "inventoryRecords",
          action: "list",
          payload: {},
          cacheable: true
        })
      ]);

      if (Array.isArray(remoteSessions)) {
        this.sessions = remoteSessions;
      }

      if (Array.isArray(remoteRecords)) {
        this.records = remoteRecords;
      }
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "inventory pull failed";
    }
  }

  pushRecord(record) {
    if (!gasApiClient.isEnabled()) {
      return;
    }

    const session = this.sessions.find((item) => item.sessionId === record.sessionId);
    const payloadItem = {
      ...record,
      storeName: session?.storeName ?? "",
      inventoryDate: session?.inventoryDate ?? ""
    };

    void gasApiClient
      .request({
        entity: "inventoryRecords",
        action: "upsert",
        payload: { item: payloadItem }
      })
      .catch((error) => {
        this.lastSyncError = error instanceof Error ? error.message : "record sync failed";
      });
  }
}
