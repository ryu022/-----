export const productValidator = {
  validateRequired(input) {
    const errors = {};

    if (!input.name || !input.name.trim()) {
      errors.name = "商品名は必須です。";
    }

    if (!input.category) {
      errors.category = "分類は必須です。";
    }

    if (!input.standard) {
      errors.standard = "規格は必須です。";
    }

    if (!Number.isFinite(Number(input.cost)) || Number(input.cost) <= 0) {
      errors.cost = "原価は0より大きい数値を入力してください。";
    }

    if (!input.supplier) {
      errors.supplier = "仕入先は必須です。";
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
};
