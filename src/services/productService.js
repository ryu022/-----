import { ProductModel } from "../models/productModel.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { productValidator } from "../validators/productValidator.js";

class ProductService {
  constructor() {
    this.repository = new ProductRepository();
    this.editingProductId = null;
    this.noticeMessage = "";
  }

  async initialize() {
    await this.repository.initialize();
  }

  listProducts() {
    return this.repository.getAll();
  }

  searchProducts({ keyword = "", category = "", standard = "" }) {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return this.repository.getAll().filter((product) => {
      const byCategory = category ? product.category === category : true;
      const byStandard = standard ? product.standard === standard : true;
      const byKeyword = normalizedKeyword
        ? [product.name, product.standard, product.category, product.supplier]
            .join(" ")
            .toLowerCase()
            .includes(normalizedKeyword)
        : true;

      return byCategory && byStandard && byKeyword;
    });
  }

  getNextProductId() {
    return this.repository.nextId();
  }

  getProductById(id) {
    return this.repository.getById(id);
  }

  async createProduct(rawInput) {
    const validation = productValidator.validateRequired(rawInput);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    const payload = ProductModel.fromForm(rawInput);
    const model = new ProductModel({
      id: this.repository.nextId(),
      ...payload
    });

    const result = await this.repository.addWithSync(model);
    if (!result.success) {
      return {
        success: false,
        errors: { common: result.error }
      };
    }

    return { success: true, product: result.product };
  }

  async updateProduct(id, rawInput) {
    const validation = productValidator.validateRequired(rawInput);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    const payload = ProductModel.fromForm(rawInput);
    const result = await this.repository.updateWithSync(id, payload);

    if (!result.success) {
      return {
        success: false,
        errors: { common: result.error || "対象商品が見つかりませんでした。" }
      };
    }

    return { success: true, product: result.product };
  }

  deleteProduct(id) {
    return this.repository.remove(id);
  }

  setEditingProduct(id) {
    this.editingProductId = id;
  }

  clearEditingProduct() {
    this.editingProductId = null;
  }

  getEditingProduct() {
    if (!this.editingProductId) {
      return null;
    }

    return this.repository.getById(this.editingProductId);
  }

  setNotice(message) {
    this.noticeMessage = message;
  }

  consumeNotice() {
    const current = this.noticeMessage;
    this.noticeMessage = "";
    return current;
  }
}

export const productService = new ProductService();
