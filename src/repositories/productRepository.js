import { gasApiClient } from "./gasApiClient.js";

const STORAGE_KEY = "inventory-app-products-v1";

const FALLBACK_SEED = [
  { id: "P000001", name: "真あじ", standard: "kg", category: "鮮魚", cost: 280, supplier: "佐賀魚" },
  { id: "P000002", name: "塩さば", standard: "P", category: "塩干", cost: 198, supplier: "久留米" },
  { id: "P000003", name: "しらす干し", standard: "kg", category: "塩干", cost: 240, supplier: "ショクリュー" },
  { id: "P000004", name: "まぐろ切り落とし", standard: "kg", category: "鮮魚", cost: 320, supplier: "CGC" },
  { id: "P000005", name: "ラップ", standard: "P", category: "資材", cost: 120, supplier: "森田物産" }
];

const clone = (value) => structuredClone(value);

const sortById = (products) => {
  products.sort((a, b) => a.id.localeCompare(b.id));
  return products;
};

export class ProductRepository {
  constructor() {
    this.products = [];
    this.lastSyncError = "";
  }

  async initialize() {
    const local = window.localStorage.getItem(STORAGE_KEY);

    if (local) {
      this.products = JSON.parse(local);
    } else {
      try {
        const response = await fetch("./src/assets/products.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load seed: ${response.status}`);
        }
        this.products = sortById(await response.json());
      } catch {
        this.products = sortById(clone(FALLBACK_SEED));
      }
      this.persist();
    }

    if (gasApiClient.isEnabled()) {
      await this.pullFromGas();
    }
  }

  getAll() {
    return clone(this.products);
  }

  getById(id) {
    return clone(this.products.find((product) => product.id === id));
  }

  add(product) {
    this.products.push(product);
    sortById(this.products);
    this.persist();
    this.pushChange("upsert", product);
    return clone(product);
  }

  update(id, nextValues) {
    const index = this.products.findIndex((product) => product.id === id);
    if (index < 0) {
      return null;
    }

    this.products[index] = {
      ...this.products[index],
      ...nextValues,
      id: this.products[index].id
    };

    this.persist();
    this.pushChange("upsert", this.products[index]);
    return clone(this.products[index]);
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
      const numeric = Number(item.id.replace(/^P/, ""));
      return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
    }, 0);

    return `P${String(max + 1).padStart(6, "0")}`;
  }

  persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.products));
  }

  async pullFromGas() {
    try {
      const remoteProducts = await gasApiClient.request({
        entity: "products",
        action: "list",
        payload: {},
        cacheable: true
      });

      if (Array.isArray(remoteProducts) && remoteProducts.length > 0) {
        this.products = sortById(remoteProducts);
        this.persist();
      } else if (this.products.length > 0) {
        await gasApiClient.request({
          entity: "products",
          action: "bulkUpsert",
          payload: { items: this.products }
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
    try {
      if (action === "delete") {
        await gasApiClient.request({
          entity: "products",
          action: "delete",
          payload: { id: product.id }
        });
        return;
      }

      await gasApiClient.request({
        entity: "products",
        action: "upsert",
        payload: { item: product }
      });
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "product sync failed";
    }
  }
}
