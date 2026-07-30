import { assignmentService } from "./assignmentService.js";
import { productService } from "./productService.js";
import { InventoryRepository } from "../repositories/inventoryRepository.js";
import { InventorySessionModel } from "../models/inventorySessionModel.js";
import { InventoryRecordModel } from "../models/inventoryRecordModel.js";

export const LOCATION_TABS = [
  { label: "売場", key: "salesFloor" },
  { label: "バックヤード", key: "backyard" },
  { label: "資材", key: "materials" }
];

class InventoryService {
  constructor() {
    this.repository = new InventoryRepository();
  }

  async initialize() {
    await this.repository.initialize();
  }

  getActiveSession() {
    return this.repository.getActiveSession();
  }

  // 既存画面の互換維持: 商品マスター一覧を取得する。
  getProducts() {
    return productService.listProducts();
  }

  startSession({ storeName, inventoryDate }) {
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

    const existing = this.repository.findSessionByStoreDate(normalizedStoreName, normalizedInventoryDate);
    const session = existing
      ? new InventorySessionModel(existing)
      : InventorySessionModel.create({
          sessionId: this.repository.nextSessionId(),
          storeName: normalizedStoreName,
          inventoryDate: normalizedInventoryDate
        });

    this.repository.saveSession(session);
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

  saveQuantity({ productId, locationKey, quantity }) {
    const session = this.repository.getActiveSession();
    if (!session) {
      return { success: false, error: "棚卸セッションが開始されていません。" };
    }

    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity < 0) {
      return { success: false, error: "数量は0以上の数値で入力してください。" };
    }

    const current = this.repository.getRecord(session.sessionId, productId, locationKey);
    const record = current
      ? new InventoryRecordModel({
          ...current,
          quantity: numericQuantity
        })
      : InventoryRecordModel.create({
          recordId: this.repository.nextRecordId(),
          sessionId: session.sessionId,
          productId,
          location: locationKey,
          quantity: numericQuantity
        });

    const result = this.repository.upsertRecord(record);
    return { success: true, changed: result.changed };
  }
}

export const inventoryService = new InventoryService();
