import { InventoryController } from "../controllers/inventoryController.js";

export const renderInventoryPage = () => {
  const controller = new InventoryController();
  return controller.render();
};
