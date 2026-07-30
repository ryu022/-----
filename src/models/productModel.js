import { escapeHtml } from "../utils/security.js";

export class ProductModel {
  constructor({ id, name, standard, category, cost, supplier }) {
    this.id = id;
    this.name = name;
    this.standard = standard;
    this.category = category;
    this.cost = Number(cost);
    this.supplier = supplier;
  }

  static fromForm(input) {
    return {
      name: escapeHtml(input.name.trim()),
      standard: input.standard,
      category: input.category,
      cost: Number(input.cost),
      supplier: input.supplier
    };
  }
}
