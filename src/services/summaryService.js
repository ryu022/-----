import { PRODUCT_CATEGORIES } from "../config/productMasterConstants.js";
import { calculationService } from "./calculationService.js";
import { inventoryService } from "./inventoryService.js";
import { productService } from "./productService.js";

const CATEGORY_LOCATION_KEYS = {
  鮮魚: ["salesFloor", "backyard"],
  塩干: ["salesFloor", "backyard"],
  資材: ["materials"]
};

class SummaryService {
  getRowsByCategory(category, sessionId) {
    const products = productService.listProducts().filter((product) => product.category === category);
    const targetSessionId = sessionId ?? inventoryService.getActiveSession()?.sessionId;

    const rows = products.map((product) => {
      const salesFloorQuantity = inventoryService.getQuantityByProductAndLocation(targetSessionId, product.id, "salesFloor");
      const backyardQuantity = inventoryService.getQuantityByProductAndLocation(targetSessionId, product.id, "backyard");
      const materialsQuantity = inventoryService.getQuantityByProductAndLocation(targetSessionId, product.id, "materials");
      const totalQuantity = this.computeCategoryQuantity({
        category,
        salesFloorQuantity,
        backyardQuantity,
        materialsQuantity
      });
      const amount = calculationService.computeAmount(product.cost, totalQuantity);

      return {
        product,
        salesFloorQuantity,
        backyardQuantity,
        materialsQuantity,
        totalQuantity,
        amount
      };
    });

    return rows;
  }

  computeCategoryQuantity({ category, salesFloorQuantity, backyardQuantity, materialsQuantity }) {
    const locationKeys = CATEGORY_LOCATION_KEYS[category] ?? ["salesFloor", "backyard"];
    let total = 0;

    locationKeys.forEach((locationKey) => {
      if (locationKey === "salesFloor") {
        total += calculationService.toNumber(salesFloorQuantity);
      }

      if (locationKey === "backyard") {
        total += calculationService.toNumber(backyardQuantity);
      }

      if (locationKey === "materials") {
        total += calculationService.toNumber(materialsQuantity);
      }
    });

    return calculationService.roundQuantity(total);
  }

  getCategoryTotals(sessionId) {
    const categoryTotals = {};

    PRODUCT_CATEGORIES.forEach((category) => {
      const total = this.getRowsByCategory(category, sessionId).reduce((sum, row) => sum + row.amount, 0);
      categoryTotals[category] = total;
    });

    const grandTotal = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);

    return {
      categoryTotals,
      grandTotal
    };
  }
}

export const summaryService = new SummaryService();
