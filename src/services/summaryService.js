import { PRODUCT_CATEGORIES } from "../config/productMasterConstants.js";
import { calculationService } from "./calculationService.js";
import { inventoryService } from "./inventoryService.js";
import { productService } from "./productService.js";

class SummaryService {
  getRowsByCategory(category) {
    const products = productService.listProducts().filter((product) => product.category === category);
    const session = inventoryService.getActiveSession();

    const rows = products.map((product) => {
      const salesFloorQuantity = inventoryService.getQuantityByProductAndLocation(session?.sessionId, product.id, "salesFloor");
      const backyardQuantity = inventoryService.getQuantityByProductAndLocation(session?.sessionId, product.id, "backyard");
      const totalQuantity = calculationService.computeTotalQuantity(salesFloorQuantity, backyardQuantity);
      const amount = calculationService.computeAmount(product.cost, totalQuantity);

      return {
        product,
        salesFloorQuantity,
        backyardQuantity,
        totalQuantity,
        amount
      };
    });

    return rows;
  }

  getCategoryTotals() {
    const categoryTotals = {};

    PRODUCT_CATEGORIES.forEach((category) => {
      const total = this.getRowsByCategory(category).reduce((sum, row) => sum + row.amount, 0);
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
