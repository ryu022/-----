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

  // 商品一括登録: 各行を既存バリデーション/採番ルールで検証し、有効な行だけまとめてGASへ送信する。
  async createProductsBulk(rows) {
    const validatedRows = rows.map((rawInput) => ({
      rawInput,
      validation: productValidator.validateRequired(rawInput)
    }));

    const errors = [];
    let nextNumeric = Number(String(this.repository.nextId()).replace(/^P/, ""));

    const preparedProducts = [];
    validatedRows.forEach(({ rawInput, validation }, index) => {
      if (!validation.isValid) {
        errors.push({
          row: index + 1,
          name: rawInput.name || "",
          message: Object.values(validation.errors).join(" / ")
        });
        return;
      }

      const payload = ProductModel.fromForm(rawInput);
      const model = new ProductModel({ id: `P${String(nextNumeric).padStart(6, "0")}`, ...payload });
      nextNumeric += 1;
      preparedProducts.push({ row: index + 1, name: model.name, model });
    });

    if (preparedProducts.length === 0) {
      return { successCount: 0, failCount: errors.length, errors };
    }

    const result = await this.repository.bulkAddWithSync(preparedProducts.map((item) => item.model));

    if (!result.success) {
      preparedProducts.forEach((item) => {
        errors.push({ row: item.row, name: item.name, message: result.error || "登録に失敗しました。" });
      });
      return { successCount: 0, failCount: errors.length, errors: errors.sort((a, b) => a.row - b.row) };
    }

    return {
      successCount: preparedProducts.length,
      failCount: errors.length,
      errors: errors.sort((a, b) => a.row - b.row)
    };
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
