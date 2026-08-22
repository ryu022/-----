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

const normalizeSession = (session, storeId) => ({
  ...session,
  storeId: session?.storeId ?? storeId,
  status: session?.status || "draft",
  completedAt: session?.completedAt || "",
  completedBy: session?.completedBy || "",
  updatedAt: session?.updatedAt || session?.createdAt || new Date().toISOString(),
  updatedBy: session?.updatedBy || ""
});

export class InventoryRepository {
  constructor() {
    this.sessions = [];
    this.records = [];
    this.activeSessionId = "";
    this.storeId = getRuntimeStoreId();
    this.lastSyncError = "";
    this.loadedSessionRecordIds = new Set();
  }

  async initialize() {
    this.setStoreId(getRuntimeStoreId());

    const localSessions = window.localStorage.getItem(getSessionStorageKey(this.storeId));
    const localRecords = window.localStorage.getItem(getRecordStorageKey(this.storeId));
    const localActiveSessionId = window.localStorage.getItem(getActiveSessionStorageKey(this.storeId));

    if (localSessions && localRecords) {
      this.sessions = JSON.parse(localSessions).map((item) => normalizeSession(item, this.storeId));
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

        this.sessions = (await sessionResponse.json()).map((item) => normalizeSession(item, this.storeId));
        this.records = (await recordResponse.json()).map((item) =>
          normalizeRecordLocation({ ...item, storeId: item.storeId ?? this.storeId })
        );
      } catch {
        this.sessions = [];
        this.records = [];
      }
    }

    // inventorySessions/listは重いため起動時には取得しない(過去の棚卸画面を開いた時にsyncSessionsFromGasで取得する)。
    if (gasApiClient.isEnabled() && this.activeSessionId) {
      try {
        await this.loadRecordsBySessionId(this.activeSessionId, { force: true });
      } catch (error) {
        this.lastSyncError = error instanceof Error ? error.message : "inventory pull failed";
      }
    }

    const activeSession = this.sessions.find((session) => session.sessionId === this.activeSessionId);
    if (activeSession && activeSession.status === "completed") {
      this.activeSessionId = "";
    }

    this.persistSessions();
    this.persistRecords();
    this.persistActiveSessionId();
  }

  setStoreId(storeId) {
    const nextStoreId = storeId || getRuntimeStoreId() || "default";
    this.storeId = nextStoreId;
    this.loadedSessionRecordIds = new Set();

    const localSessions = window.localStorage.getItem(getSessionStorageKey(this.storeId));
    const localRecords = window.localStorage.getItem(getRecordStorageKey(this.storeId));
    const localActiveSessionId = window.localStorage.getItem(getActiveSessionStorageKey(this.storeId));

    if (localSessions && localRecords) {
      this.sessions = JSON.parse(localSessions).map((item) => normalizeSession(item, this.storeId));
      this.records = JSON.parse(localRecords).map((item) => normalizeRecordLocation(item));
      this.activeSessionId = localActiveSessionId ?? "";

      const activeSession = this.sessions.find((session) => session.sessionId === this.activeSessionId);
      if (activeSession && activeSession.status === "completed") {
        this.activeSessionId = "";
      }
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

  setActiveSessionId(sessionId) {
    this.activeSessionId = sessionId;
    this.persistActiveSessionId();
  }

  clearActiveSessionId() {
    this.activeSessionId = "";
    this.persistActiveSessionId();
  }

  listSessions() {
    return clone(this.sessions);
  }

  getSessionById(sessionId) {
    return clone(this.sessions.find((session) => session.sessionId === sessionId));
  }

  findSessionByStoreDate(storeName, inventoryDate) {
    return clone(
      this.sessions.find(
        (item) => item.storeId === this.storeId && item.storeName === storeName && item.inventoryDate === inventoryDate
      )
    );
  }

  async saveSession(session, { setActive = true } = {}) {
    const normalized = normalizeSession({ ...clone(session), storeId: this.storeId }, this.storeId);
    const index = this.sessions.findIndex((item) => item.sessionId === normalized.sessionId);
    if (index >= 0) {
      this.sessions[index] = normalized;
    } else {
      this.sessions.push(normalized);
    }

    if (setActive) {
      this.activeSessionId = normalized.sessionId;
    }
    this.persistSessions();
    this.persistActiveSessionId();

    if (!gasApiClient.isEnabled()) {
      return { success: true, session: normalized };
    }

    try {
      await gasApiClient.request({
        entity: "inventorySessions",
        action: "upsert",
        payload: { storeId: this.storeId, item: normalized }
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

  hasRecordsForSession(sessionId) {
    return this.records.some((record) => record.sessionId === sessionId);
  }

  async loadRecordsBySessionId(sessionId, { force = false } = {}) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return [];
    }

    if (!gasApiClient.isEnabled()) {
      return this.getRecordsBySession(normalizedSessionId);
    }

    if (!force && this.loadedSessionRecordIds.has(normalizedSessionId) && this.hasRecordsForSession(normalizedSessionId)) {
      return this.getRecordsBySession(normalizedSessionId);
    }

    const remoteRecords = await gasApiClient.request({
      entity: "inventoryRecords",
      action: "listBySession",
      payload: {
        storeId: this.storeId,
        sessionId: normalizedSessionId
      },
      cacheable: false
    });

    if (Array.isArray(remoteRecords)) {
      this.records = this.records.filter((record) => record.sessionId !== normalizedSessionId);
      this.records.push(
        ...remoteRecords
          .filter((item) => item && (item.storeId === this.storeId || !item.storeId))
          .map((item) => normalizeRecordLocation({ ...item, storeId: item.storeId ?? this.storeId }))
      );
      this.loadedSessionRecordIds.add(normalizedSessionId);
      this.persistRecords();
    }

    return this.getRecordsBySession(normalizedSessionId);
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

  async completeSession({ sessionId, completedBy = "" }) {
    if (!this.storeId) {
      return { success: false, error: "店舗情報が未設定のため棚卸完了できません。" };
    }

    const index = this.sessions.findIndex((session) => session.sessionId === sessionId);
    if (index < 0) {
      return { success: false, error: "棚卸セッションが見つかりません。" };
    }

    const now = new Date().toISOString();
    const completedSession = normalizeSession(
      {
        ...this.sessions[index],
        status: "completed",
        completedAt: now,
        completedBy: completedBy || this.sessions[index].completedBy || "",
        updatedAt: now,
        updatedBy: completedBy || this.sessions[index].updatedBy || ""
      },
      this.storeId
    );

    this.sessions[index] = completedSession;
    this.clearActiveSessionId();
    this.persistSessions();

    if (!gasApiClient.isEnabled()) {
      return { success: true, session: clone(completedSession) };
    }

    try {
      await gasApiClient.request({
        entity: "inventorySessions",
        action: "complete",
        payload: {
          storeId: this.storeId,
          sessionId,
          item: completedSession
        }
      });
      return { success: true, session: clone(completedSession) };
    } catch (error) {
      console.error("[COMPLETE ERROR]", {
        entity: "inventorySessions",
        action: "complete",
        storeId: this.storeId,
        sessionId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : "",
        gasErrorCode: error?.gasErrorCode ?? "",
        gasErrorMessage: error?.gasErrorMessage ?? "",
        gasErrorStack: error?.gasErrorStack ?? "",
        httpStatus: error?.httpStatus ?? ""
      });
      this.lastSyncError = error instanceof Error ? error.message : "session complete failed";
      return {
        success: false,
        error: "Googleスプレッドシートへの保存に失敗しました。",
        session: clone(completedSession)
      };
    }
  }

  async deleteSessionsByIds(sessionIds) {
    const targets = new Set((sessionIds || []).filter(Boolean));
    if (targets.size === 0) {
      return { success: true, deletedCount: 0 };
    }

    if (!this.storeId) {
      return {
        success: false,
        error: "店舗情報が未設定のため削除できません。",
        deletedCount: 0
      };
    }

    if (!gasApiClient.isEnabled()) {
      const beforeCount = this.sessions.length;
      this.sessions = this.sessions.filter((session) => !targets.has(session.sessionId));
      this.records = this.records.filter((record) => !targets.has(record.sessionId));

      if (targets.has(this.activeSessionId)) {
        this.clearActiveSessionId();
      }

      this.persistSessions();
      this.persistRecords();
      return { success: true, deletedCount: beforeCount - this.sessions.length };
    }

    try {
      const payload = { storeId: this.storeId, sessionIds: Array.from(targets) };
      console.info("inventory bulk delete request", {
        entity: "inventorySessions",
        action: "bulkDelete",
        storeId: this.storeId,
        sessionIds: payload.sessionIds,
        payload
      });

      await gasApiClient.request({
        entity: "inventorySessions",
        action: "bulkDelete",
        payload
      });

      const beforeCount = this.sessions.length;
      this.sessions = this.sessions.filter((session) => !targets.has(session.sessionId));
      this.records = this.records.filter((record) => !targets.has(record.sessionId));

      if (targets.has(this.activeSessionId)) {
        this.clearActiveSessionId();
      }

      this.persistSessions();
      this.persistRecords();

      return { success: true, deletedCount: beforeCount - this.sessions.length };
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "session bulk delete failed";
      return {
        success: false,
        error: "Googleスプレッドシートからの削除に失敗しました。",
        deletedCount: 0
      };
    }
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

  // 過去の棚卸一覧を開いたタイミングで呼び出す想定の遅延同期(起動時には呼ばない)。
  async syncSessionsFromGas() {
    if (!gasApiClient.isEnabled()) {
      return;
    }

    try {
      const remoteSessions = await gasApiClient.request({
        entity: "inventorySessions",
        action: "list",
        payload: { storeId: this.storeId },
        cacheable: true
      });

      if (Array.isArray(remoteSessions)) {
        this.sessions = remoteSessions
          .filter((item) => item && (item.storeId === this.storeId || !item.storeId))
          .map((item) => normalizeSession(item, this.storeId));
        this.persistSessions();
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
      inventoryDate: session?.inventoryDate ?? "",
      updatedBy: record?.updatedBy || ""
    };

    try {
      await gasApiClient.request({
        entity: "inventoryRecords",
        action: "upsert",
        payload: { storeId: this.storeId, item: payloadItem }
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
