import { assignmentService } from "./assignmentService.js";
import { productService } from "./productService.js";
import { InventoryRepository } from "../repositories/inventoryRepository.js";
import { InventorySessionModel } from "../models/inventorySessionModel.js";
import { InventoryRecordModel } from "../models/inventoryRecordModel.js";
import { setRuntimeStoreContext } from "../config/runtimeConfig.js";

export const LOCATION_TABS = [
  { label: "売場", key: "salesFloor" },
  { label: "バックヤード", key: "backyard" },
  { label: "資材", key: "materials" }
];

const EDITABLE_LOCATION_KEYS_BY_CATEGORY = {
  鮮魚: ["salesFloor", "backyard"],
  塩干: ["salesFloor", "backyard"],
  資材: ["materials"]
};

class InventoryService {
  constructor() {
    this.repository = new InventoryRepository();
    this.printSessionId = "";
  }

  async initialize() {
    await this.repository.initialize();
  }

  getActiveSession() {
    return this.repository.getActiveSession();
  }

  listSessions() {
    return this.repository.listSessions().sort((a, b) => {
      const aSortKey = a.completedAt || a.updatedAt || a.createdAt || a.inventoryDate || "";
      const bSortKey = b.completedAt || b.updatedAt || b.createdAt || b.inventoryDate || "";
      return String(bSortKey).localeCompare(String(aSortKey));
    });
  }

  getSessionById(sessionId) {
    return this.repository.getSessionById(sessionId);
  }

  async loadSessionRecordsForView(sessionId, { force = true } = {}) {
    const session = this.repository.getSessionById(sessionId);
    if (!session) {
      return { success: false, error: "棚卸セッションが見つかりません。" };
    }

    try {
      await this.repository.loadRecordsBySessionId(sessionId, { force });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "棚卸データの取得に失敗しました。"
      };
    }
  }

  setPrintSessionId(sessionId) {
    this.printSessionId = String(sessionId || "").trim();
  }

  consumePrintSession() {
    const sessionId = this.printSessionId;
    this.printSessionId = "";

    if (!sessionId) {
      return this.repository.getActiveSession();
    }

    return this.repository.getSessionById(sessionId) || null;
  }

  // 既存画面の互換維持: 商品マスター一覧を取得する。
  getProducts() {
    return productService.listProducts();
  }

  async startSession({ storeName, inventoryDate }) {
    const errors = {};
    const normalizedStoreName = storeName?.trim() ?? "";
    const normalizedInventoryDate = inventoryDate?.trim() ?? "";

    if (!normalizedStoreName) {
      errors.storeName = "店舗名は必須です。";
    }

    if (!normalizedInventoryDate) {
      errors.inventoryDate = "棚卸日は必須です。";
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, errors };
    }

    const storeId = setRuntimeStoreContext({ storeName: normalizedStoreName });
    this.repository.setStoreId(storeId);
    productService.repository.setStoreId(storeId);
    assignmentService.repository.setStoreId(storeId);

    const session = InventorySessionModel.create({
      sessionId: this.repository.nextSessionId(),
      storeId,
      storeName: normalizedStoreName,
      inventoryDate: normalizedInventoryDate
    });

    const result = await this.repository.saveSession(session);
    if (!result.success) {
      return { success: false, error: result.error, session };
    }
    return { success: true, session };
  }

  listProductsForLocation(locationKey) {
    const session = this.repository.getActiveSession();
    const products = productService.listProducts();
    const sorted = assignmentService.listByArea(products, locationKey);

    if (!session) {
      return sorted.map(({ product }) => ({ product, quantity: 0 }));
    }

    const recordMap = new Map(
      this.repository
        .getRecordsBySession(session.sessionId)
        .map((record) => [`${record.productId}:${record.location}`, record])
    );

    return sorted.map(({ product }) => {
      const record = recordMap.get(`${product.id}:${locationKey}`);
      return {
        product,
        quantity: record ? record.quantity : 0
      };
    });
  }

  getQuantityByProductAndLocation(sessionId, productId, locationKey) {
    if (!sessionId) {
      return 0;
    }

    const record = this.repository.getRecord(sessionId, productId, locationKey);
    return record ? record.quantity : 0;
  }

  getEditableLocationKeysByCategory(category) {
    return EDITABLE_LOCATION_KEYS_BY_CATEGORY[category] ?? ["salesFloor", "backyard"];
  }

  async saveQuantity({ productId, locationKey, quantity }) {
    const session = this.repository.getActiveSession();
    if (!session) {
      return { success: false, error: "棚卸セッションが開始されていません。" };
    }

    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity < 0) {
      return { success: false, error: "数量は0以上の数値で入力してください。" };
    }

    const current = this.repository.getRecord(session.sessionId, productId, locationKey);
    const now = new Date().toISOString();
    const record = current
      ? new InventoryRecordModel({
          ...current,
          quantity: numericQuantity,
          updatedAt: now
        })
      : InventoryRecordModel.create({
          recordId: this.repository.nextRecordId(),
          sessionId: session.sessionId,
          productId,
          location: locationKey,
          quantity: numericQuantity,
          updatedAt: now
        });

    const result = await this.repository.upsertRecord(record);
    if (!result.success) {
      return { success: false, error: result.error, changed: false };
    }
    return { success: true, changed: result.changed };
  }

  async saveQuantityForSession({ sessionId, productId, locationKey, quantity, updatedBy = "" }) {
    const session = this.repository.getSessionById(sessionId);
    if (!session) {
      return { success: false, error: "棚卸セッションが見つかりません。" };
    }

    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity < 0) {
      return { success: false, error: "数量は0以上の数値で入力してください。" };
    }

    const current = this.repository.getRecord(sessionId, productId, locationKey);
    const now = new Date().toISOString();
    const record = current
      ? new InventoryRecordModel({
          ...current,
          quantity: numericQuantity,
          updatedAt: now,
          updatedBy
        })
      : InventoryRecordModel.create({
          recordId: this.repository.nextRecordId(),
          sessionId,
          productId,
          location: locationKey,
          quantity: numericQuantity,
          updatedAt: now,
          updatedBy
        });

    const result = await this.repository.upsertRecord(record);
    if (!result.success) {
      return { success: false, error: result.error, changed: false };
    }

    const nextSession = new InventorySessionModel({
      ...session,
      updatedAt: now,
      updatedBy: updatedBy || session.updatedBy || ""
    });
    await this.repository.saveSession(nextSession, { setActive: false });
    return { success: true, changed: result.changed };
  }

  async completeActiveSession({ completedBy = "" } = {}) {
    const session = this.repository.getActiveSession();
    if (!session) {
      return { success: false, error: "棚卸セッションが開始されていません。" };
    }

    if (session.status === "completed") {
      return { success: true, session };
    }

    return this.repository.completeSession({ sessionId: session.sessionId, completedBy });
  }

  async deleteSessionsByIds(sessionIds) {
    return this.repository.deleteSessionsByIds(sessionIds);
  }
}

export const inventoryService = new InventoryService();
