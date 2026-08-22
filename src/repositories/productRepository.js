import { gasApiClient } from "./gasApiClient.js";
import { getRuntimeStoreId } from "../config/runtimeConfig.js";

const STORAGE_KEY_PREFIX = "inventory-app-products-v1";

const FALLBACK_SEED = [
  { id: "P000001", name: "真あじ", standard: "kg", category: "鮮魚", cost: 280, supplier: "佐賀魚" },
  { id: "P000002", name: "塩さば", standard: "P", category: "塩干", cost: 198, supplier: "久留米" },
  { id: "P000003", name: "しらす干し", standard: "kg", category: "塩干", cost: 240, supplier: "ショクリュー" },
  { id: "P000004", name: "まぐろ切り落とし", standard: "kg", category: "鮮魚", cost: 320, supplier: "CGC" },
  { id: "P000005", name: "ラップ", standard: "P", category: "資材", cost: 120, supplier: "森田物産" }
];

const clone = (value) => structuredClone(value);
const getStorageKey = (storeId) => `${STORAGE_KEY_PREFIX}:${storeId || "default"}`;

const sortById = (products) => {
  products.sort((a, b) => String(a.id ?? a.productId).localeCompare(String(b.id ?? b.productId)));
  return products;
};

const normalizeProduct = (item, storeId) => {
  const productId = item?.productId ?? item?.id;
  return {
    ...item,
    id: productId,
    productId,
    storeId: item?.storeId ?? storeId
  };
};

export class ProductRepository {
  constructor() {
    this.products = [];
    this.storeId = getRuntimeStoreId();
    this.lastSyncError = "";
  }

  async initialize() {
    this.setStoreId(getRuntimeStoreId());

    const local = window.localStorage.getItem(getStorageKey(this.storeId));

    if (local) {
      this.products = JSON.parse(local);
    } else {
      try {
        const response = await fetch("./src/assets/products.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load seed: ${response.status}`);
        }
        this.products = sortById((await response.json()).map((item) => normalizeProduct(item, this.storeId)));
      } catch {
        this.products = sortById(clone(FALLBACK_SEED).map((item) => normalizeProduct(item, this.storeId)));
      }
      this.persist();
    }

    if (gasApiClient.isEnabled()) {
      await this.pullFromGas();
    }
  }

  setStoreId(storeId) {
    const nextStoreId = storeId || getRuntimeStoreId() || "default";
    this.storeId = nextStoreId;

    const local = window.localStorage.getItem(getStorageKey(this.storeId));
    if (local) {
      this.products = JSON.parse(local);
    }
  }

  getAll() {
    return clone(this.products);
  }

  getById(id) {
    return clone(this.products.find((product) => product.id === id));
  }

  add(product) {
    const normalized = normalizeProduct(product, this.storeId);
    this.products.push(normalized);
    sortById(this.products);
    this.persist();
    this.pushChange("upsert", normalized);
    return clone(normalized);
  }

  async addWithSync(product) {
    const normalized = normalizeProduct(product, this.storeId);
    this.products.push(normalized);
    sortById(this.products);
    this.persist();

    try {
      await this.syncChange("upsert", normalized);
      return { success: true, product: clone(normalized) };
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "product sync failed";
      return {
        success: false,
        error: "Googleスプレッドシートへの保存に失敗しました。",
        product: clone(normalized)
      };
    }
  }

  // 一括登録用: 複数商品をまとめてGASへ送信する(1件ずつのupsert通信を避ける)。
  async bulkAddWithSync(products) {
    const normalized = products.map((product) => normalizeProduct(product, this.storeId));
    normalized.forEach((product) => this.products.push(product));
    sortById(this.products);
    this.persist();

    if (!gasApiClient.isEnabled()) {
      return { success: true, products: normalized.map(clone) };
    }

    try {
      await gasApiClient.request({
        entity: "products",
        action: "bulkUpsert",
        payload: { items: normalized }
      });
      return { success: true, products: normalized.map(clone) };
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "product bulk sync failed";
      return {
        success: false,
        error: "Googleスプレッドシートへの一括保存に失敗しました。",
        products: normalized.map(clone)
      };
    }
  }

  async updateWithSync(id, nextValues) {
    const index = this.products.findIndex((product) => product.id === id);
    if (index < 0) {
      return null;
    }

    this.products[index] = {
      ...this.products[index],
      ...nextValues,
      id: this.products[index].id,
      productId: this.products[index].id,
      storeId: this.storeId
    };

    this.persist();

    try {
      await this.syncChange("upsert", this.products[index]);
      return { success: true, product: clone(this.products[index]) };
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "product sync failed";
      return {
        success: false,
        error: "Googleスプレッドシートへの保存に失敗しました。",
        product: clone(this.products[index])
      };
    }
  }

  remove(id) {
    const index = this.products.findIndex((product) => product.id === id);
    if (index < 0) {
      return false;
    }

    const removed = this.products[index];
    this.products.splice(index, 1);
    this.persist();
    this.pushChange("delete", removed);
    return true;
  }

  nextId() {
    const max = this.products.reduce((acc, item) => {
      const numeric = Number(String(item.id ?? item.productId).replace(/^P/, ""));
      return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
    }, 0);

    return `P${String(max + 1).padStart(6, "0")}`;
  }

  persist() {
    window.localStorage.setItem(getStorageKey(this.storeId), JSON.stringify(this.products));
  }

  async pullFromGas() {
    try {
      const remoteProducts = await gasApiClient.request({
        entity: "products",
        action: "list",
        payload: { storeId: this.storeId },
        cacheable: true
      });

      const normalized = (Array.isArray(remoteProducts) ? remoteProducts : [])
        .filter((item) => item && (item.storeId === this.storeId || !item.storeId))
        .map((item) => normalizeProduct(item, this.storeId));

      if (normalized.length > 0) {
        this.products = sortById(normalized);
        this.persist();
      } else if (this.products.length > 0) {
        await gasApiClient.request({
          entity: "products",
          action: "bulkUpsert",
          payload: { items: this.products.map((item) => normalizeProduct(item, this.storeId)) }
        });
      }
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "product pull failed";
    }
  }

  pushChange(action, product) {
    if (!gasApiClient.isEnabled()) {
      return;
    }

    void this.syncChange(action, product);
  }

  async syncChange(action, product) {
    const normalized = normalizeProduct(product, this.storeId);

    try {
      if (action === "delete") {
        await gasApiClient.request({
          entity: "products",
          action: "delete",
          payload: { id: normalized.id, storeId: this.storeId }
        });
        return;
      }

      await gasApiClient.request({
        entity: "products",
        action: "upsert",
        payload: { item: normalized }
      });
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "product sync failed";
    }
  }
}
