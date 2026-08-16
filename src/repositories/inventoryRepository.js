import { gasApiClient } from "./gasApiClient.js";
import { getRuntimeStoreId } from "../config/runtimeConfig.js";

const SESSION_STORAGE_KEY_PREFIX = "inventory-app-sessions-v1";
const RECORD_STORAGE_KEY_PREFIX = "inventory-app-records-v1";
const ACTIVE_SESSION_STORAGE_KEY_PREFIX = "inventory-app-active-session-v1";

const clone = (value) => structuredClone(value);
const getSessionStorageKey = (storeId) => `${SESSION_STORAGE_KEY_PREFIX}:${storeId || "default"}`;
const getRecordStorageKey = (storeId) => `${RECORD_STORAGE_KEY_PREFIX}:${storeId || "default"}`;
const getActiveSessionStorageKey = (storeId) => `${ACTIVE_SESSION_STORAGE_KEY_PREFIX}:${storeId || "default"}`;

const LOCATION_LABEL_BY_KEY = {
  salesFloor: "売場",
  backyard: "バックヤード",
  materials: "資材"
};

const LOCATION_KEY_BY_ALIAS = new Map([
  ["salesFloor", "salesFloor"],
  ["売場", "salesFloor"],
  ["backyard", "backyard"],
  ["バックヤード", "backyard"],
  ["materials", "materials"],
  ["資材", "materials"]
]);

const normalizeLocationKey = (value) => {
  const normalized = String(value ?? "").trim();
  return LOCATION_KEY_BY_ALIAS.get(normalized) ?? normalized;
};

const normalizeRecordLocation = (record) => ({
  ...record,
  location: normalizeLocationKey(record.location)
});

const toSheetLocationLabel = (locationKey) => LOCATION_LABEL_BY_KEY[normalizeLocationKey(locationKey)] ?? locationKey;

export class InventoryRepository {
  constructor() {
    this.sessions = [];
    this.records = [];
    this.activeSessionId = "";
    this.storeId = getRuntimeStoreId();
    this.lastSyncError = "";
  }

  async initialize() {
    this.setStoreId(getRuntimeStoreId());

    const localSessions = window.localStorage.getItem(getSessionStorageKey(this.storeId));
    const localRecords = window.localStorage.getItem(getRecordStorageKey(this.storeId));
    const localActiveSessionId = window.localStorage.getItem(getActiveSessionStorageKey(this.storeId));

    if (localSessions && localRecords) {
      this.sessions = JSON.parse(localSessions);
      this.records = JSON.parse(localRecords).map((item) => normalizeRecordLocation(item));
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

        this.sessions = (await sessionResponse.json()).map((item) => ({ ...item, storeId: item.storeId ?? this.storeId }));
        this.records = (await recordResponse.json()).map((item) =>
          normalizeRecordLocation({ ...item, storeId: item.storeId ?? this.storeId })
        );
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

  setStoreId(storeId) {
    const nextStoreId = storeId || getRuntimeStoreId() || "default";
    this.storeId = nextStoreId;

    const localSessions = window.localStorage.getItem(getSessionStorageKey(this.storeId));
    const localRecords = window.localStorage.getItem(getRecordStorageKey(this.storeId));
    const localActiveSessionId = window.localStorage.getItem(getActiveSessionStorageKey(this.storeId));

    if (localSessions && localRecords) {
      this.sessions = JSON.parse(localSessions);
      this.records = JSON.parse(localRecords).map((item) => normalizeRecordLocation(item));
      this.activeSessionId = localActiveSessionId ?? "";
    } else {
      this.sessions = [];
      this.records = [];
      this.activeSessionId = "";
    }
  }

  getActiveSession() {
    if (!this.activeSessionId) {
      return null;
    }

    return clone(this.sessions.find((session) => session.sessionId === this.activeSessionId));
  }

  findSessionByStoreDate(storeName, inventoryDate) {
    return clone(
      this.sessions.find(
        (item) => item.storeId === this.storeId && item.storeName === storeName && item.inventoryDate === inventoryDate
      )
    );
  }

  async saveSession(session) {
    const normalized = { ...clone(session), storeId: this.storeId };
    const index = this.sessions.findIndex((item) => item.sessionId === normalized.sessionId);
    if (index >= 0) {
      this.sessions[index] = normalized;
    } else {
      this.sessions.push(normalized);
    }

    this.activeSessionId = normalized.sessionId;
    this.persistSessions();
    this.persistActiveSessionId();

    if (!gasApiClient.isEnabled()) {
      return { success: true, session: normalized };
    }

    try {
      await gasApiClient.request({
        entity: "inventorySessions",
        action: "upsert",
        payload: { item: normalized }
      });
      return { success: true, session: normalized };
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "session sync failed";
      return {
        success: false,
        error: "Googleスプレッドシートへの保存に失敗しました。",
        session: normalized
      };
    }
  }

  getRecordsBySession(sessionId) {
    return clone(this.records.filter((record) => record.sessionId === sessionId));
  }

  getRecord(sessionId, productId, location) {
    const normalizedLocation = normalizeLocationKey(location);
    return clone(
      this.records.find(
        (record) =>
          record.sessionId === sessionId &&
          record.productId === productId &&
          normalizeLocationKey(record.location) === normalizedLocation
      )
    );
  }

  async upsertRecord(record) {
    const normalized = normalizeRecordLocation({ ...clone(record), storeId: this.storeId });
    const index = this.records.findIndex(
      (item) => item.sessionId === normalized.sessionId && item.productId === normalized.productId && item.location === normalized.location
    );

    if (index < 0) {
      this.records.push(normalized);
      this.persistRecords();
      const result = await this.pushRecord(normalized);
      return { changed: true, ...result };
    }

    if (this.records[index].quantity === normalized.quantity) {
      return { changed: false, success: true };
    }

    this.records[index] = normalized;
    this.persistRecords();
    const result = await this.pushRecord(normalized);
    return { changed: true, ...result };
  }

  nextSessionId() {
    const max = this.sessions.reduce((acc, item) => {
      const numeric = Number(String(item.sessionId).replace(/^S/, ""));
      return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
    }, 0);

    return `S${String(max + 1).padStart(6, "0")}`;
  }

  nextRecordId() {
    const max = this.records.reduce((acc, item) => {
      const numeric = Number(String(item.recordId).replace(/^R/, ""));
      return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
    }, 0);

    return `R${String(max + 1).padStart(6, "0")}`;
  }

  persistSessions() {
    window.localStorage.setItem(getSessionStorageKey(this.storeId), JSON.stringify(this.sessions));
  }

  persistRecords() {
    window.localStorage.setItem(getRecordStorageKey(this.storeId), JSON.stringify(this.records));
  }

  persistActiveSessionId() {
    window.localStorage.setItem(getActiveSessionStorageKey(this.storeId), this.activeSessionId);
  }

  async pullFromGas() {
    try {
      const [remoteSessions, remoteRecords] = await Promise.all([
        gasApiClient.request({
          entity: "inventorySessions",
          action: "list",
          payload: { storeId: this.storeId },
          cacheable: true
        }),
        gasApiClient.request({
          entity: "inventoryRecords",
          action: "list",
          payload: { storeId: this.storeId },
          cacheable: true
        })
      ]);

      if (Array.isArray(remoteSessions)) {
        this.sessions = remoteSessions
          .filter((item) => item && (item.storeId === this.storeId || !item.storeId))
          .map((item) => ({ ...item, storeId: item.storeId ?? this.storeId }));
      }

      if (Array.isArray(remoteRecords)) {
        this.records = remoteRecords
          .filter((item) => item && (item.storeId === this.storeId || !item.storeId))
          .map((item) => normalizeRecordLocation({ ...item, storeId: item.storeId ?? this.storeId }));
      }
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "inventory pull failed";
    }
  }

  async pushRecord(record) {
    if (!gasApiClient.isEnabled()) {
      return { success: true };
    }

    const session = this.sessions.find((item) => item.sessionId === record.sessionId);
    const payloadItem = {
      ...record,
      storeId: this.storeId,
      location: toSheetLocationLabel(record.location),
      storeName: session?.storeName ?? "",
      inventoryDate: session?.inventoryDate ?? ""
    };

    try {
      await gasApiClient.request({
        entity: "inventoryRecords",
        action: "upsert",
        payload: { item: payloadItem }
      });
      return { success: true };
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "record sync failed";
      return {
        success: false,
        error: "Googleスプレッドシートへの保存に失敗しました。"
      };
    }
  }
}
