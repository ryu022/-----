import { AssignmentController } from "../controllers/assignmentController.js";
import { productService } from "../services/productService.js";

export const renderProductAllocationPage = () => {
  const controller = new AssignmentController({ productService });
  return controller.render();
};
