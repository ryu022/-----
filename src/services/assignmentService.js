import { AssignmentModel } from "../models/assignmentModel.js";
import { AssignmentRepository } from "../repositories/assignmentRepository.js";
import { assignmentValidator } from "../validators/assignmentValidator.js";

const AREA_KEYS = ["salesFloor", "backyard", "materials"];
const ORDER_KEY_BY_AREA = {
  salesFloor: "salesFloorOrder",
  backyard: "backyardOrder",
  materials: "materialsOrder"
};

class AssignmentService {
  constructor() {
    this.repository = new AssignmentRepository();
  }

  async initialize(products) {
    await this.repository.initialize();
    this.syncWithProducts(products);
  }

  syncWithProducts(products) {
    const productIds = new Set(products.map((product) => product.id));
    const current = this.repository.getAll();
    let maxAssignmentNumber = current.reduce((acc, item) => {
      const numeric = Number(item.assignmentId.replace(/^A/, ""));
      return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
    }, 0);

    const existingByProduct = new Map(current.map((item) => [item.productId, item]));
    const synced = [];

    products.forEach((product) => {
      const existing = existingByProduct.get(product.id);
      if (existing) {
        synced.push(existing);
        return;
      }

      synced.push(
        AssignmentModel.create({
          assignmentId: `A${String(++maxAssignmentNumber).padStart(6, "0")}`,
          productId: product.id
        })
      );
    });

    // 商品マスターに存在しない割り当ては残さない。
    const filtered = synced.filter((item) => productIds.has(item.productId));
    this.repository.setAll(this.normalizeOrders(filtered));
  }

  listAll(products) {
    const map = new Map(this.repository.getAll().map((item) => [item.productId, item]));

    return products.map((product) => ({
      product,
      assignment: map.get(product.id)
    }));
  }

  listByArea(products, areaKey) {
    const orderKey = ORDER_KEY_BY_AREA[areaKey];

    return this.listAll(products)
      .filter(({ assignment }) => assignment.isTarget && assignment[areaKey])
      .sort((a, b) => {
        const orderA = a.assignment[orderKey] ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.assignment[orderKey] ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
  }

  async updateAssignment(productId, patch) {
    const validation = assignmentValidator.validatePatch(patch);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    const current = this.repository.getByProductId(productId);
    if (!current) {
      return { success: false, errors: { common: "割り当てデータが見つかりません。" } };
    }

    const next = { ...patch };

    if (patch.isTarget === false) {
      AREA_KEYS.forEach((area) => {
        const orderKey = ORDER_KEY_BY_AREA[area];
        next[area] = false;
        next[orderKey] = null;
      });
    }

    AREA_KEYS.forEach((area) => {
      if (patch[area] === false) {
        next[ORDER_KEY_BY_AREA[area]] = null;
      }
    });

    const result = await this.repository.updateByProductId(productId, next);
    if (!result || !result.success) {
      return { success: false, errors: { common: result?.error || "更新に失敗しました。" } };
    }

    this.repository.setAll(this.normalizeOrders(this.repository.getAll()));
    return { success: true };
  }

  async reorderArea(areaKey, orderedProductIds) {
    const orderKey = ORDER_KEY_BY_AREA[areaKey];
    const all = this.repository.getAll();
    const map = new Map(all.map((item) => [item.productId, item]));

    orderedProductIds.forEach((productId, index) => {
      const item = map.get(productId);
      if (!item) {
        return;
      }
      item[orderKey] = index + 1;
      item.updatedAt = new Date().toISOString();
    });

    this.repository.setAll(this.normalizeOrders(Array.from(map.values())));
    return { success: true };
  }

  normalizeOrders(assignments) {
    const next = structuredClone(assignments);

    AREA_KEYS.forEach((area) => {
      const orderKey = ORDER_KEY_BY_AREA[area];
      const targets = next
        .filter((item) => item.isTarget && item[area])
        .sort((a, b) => {
          const aOrder = a[orderKey] ?? Number.MAX_SAFE_INTEGER;
          const bOrder = b[orderKey] ?? Number.MAX_SAFE_INTEGER;
          return aOrder - bOrder;
        });

      targets.forEach((item, index) => {
        item[orderKey] = index + 1;
      });

      next.forEach((item) => {
        if (!item.isTarget || !item[area]) {
          item[orderKey] = null;
        }
      });
    });

    return next;
  }
}

export const assignmentService = new AssignmentService();
export { AREA_KEYS, ORDER_KEY_BY_AREA };
