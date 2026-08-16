import { PRODUCT_CATEGORIES, PRODUCT_STANDARDS, SUPPLIERS } from "../config/productMasterConstants.js";
import { ROUTES } from "../config/constants.js";
import { createPrimaryButton, createSectionCard } from "../components/ui.js";
import { productService } from "../services/productService.js";

export const renderProductRegisterPage = ({ navigate } = {}) => {
  const page = document.createElement("div");
  page.className = "page-stack";

  const editingProduct = productService.getEditingProduct();
  const isEditing = Boolean(editingProduct);
  const nextProductId = editingProduct?.id ?? productService.getNextProductId();

  const form = document.createElement("form");
  form.className = "field-grid";
  form.noValidate = true;

  const message = document.createElement("div");
  message.className = "notice";
  message.hidden = true;

  const flashMessage = productService.consumeNotice();
  if (flashMessage) {
    message.className = "notice is-success";
    message.textContent = flashMessage;
    message.hidden = false;
  }

  form.innerHTML = `
    <div class="field">
      <label for="productId">商品ID</label>
      <input id="productId" class="text-input" type="text" value="${nextProductId}" readonly />
    </div>
    <div class="field">
      <label for="name">商品名</label>
      <input id="name" class="text-input" type="text" placeholder="例: 真あじ" required value="${editingProduct?.name ?? ""}" />
      <small class="field-error" data-error="name"></small>
    </div>
    <div class="field">
      <label for="standard">規格</label>
      <select id="standard" class="select-input" required>
        <option value="">選択してください</option>
        ${PRODUCT_STANDARDS.map((standard) => `<option value="${standard}" ${editingProduct?.standard === standard ? "selected" : ""}>${standard}</option>`).join("")}
      </select>
      <small class="field-error" data-error="standard"></small>
    </div>
    <div class="field">
      <label for="category">分類</label>
      <select id="category" class="select-input" required>
        <option value="">選択してください</option>
        ${PRODUCT_CATEGORIES.map((tab) => `<option value="${tab}" ${editingProduct?.category === tab ? "selected" : ""}>${tab}</option>`).join("")}
      </select>
      <small class="field-error" data-error="category"></small>
    </div>
    <div class="field">
      <label for="cost">原価</label>
      <input id="cost" class="number-input" type="number" min="1" placeholder="0" required value="${editingProduct?.cost ?? ""}" />
      <small class="field-error" data-error="cost"></small>
    </div>
    <div class="field">
      <label for="supplier">仕入先</label>
      <select id="supplier" class="select-input" required>
        <option value="">選択してください</option>
        ${SUPPLIERS.map((supplier) => `<option value="${supplier}" ${editingProduct?.supplier === supplier ? "selected" : ""}>${supplier}</option>`).join("")}
      </select>
      <small class="field-error" data-error="supplier"></small>
    </div>
  `;

  const clearErrors = () => {
    form.querySelectorAll("[data-error]").forEach((element) => {
      element.textContent = "";
    });
  };

  const showErrors = (errors) => {
    clearErrors();
    Object.entries(errors).forEach(([key, text]) => {
      const target = form.querySelector(`[data-error=\"${key}\"]`);
      if (target) {
        target.textContent = text;
      }
    });
  };

  const resetForm = () => {
    form.reset();
    form.querySelector("#productId").value = productService.getNextProductId();
    clearErrors();
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    message.hidden = true;

    const input = {
      name: form.querySelector("#name").value,
      standard: form.querySelector("#standard").value,
      category: form.querySelector("#category").value,
      cost: form.querySelector("#cost").value,
      supplier: form.querySelector("#supplier").value
    };

    const result = isEditing
      ? await productService.updateProduct(editingProduct.id, input)
      : await productService.createProduct(input);

    if (!result.success) {
      showErrors(result.errors);
      return;
    }

    if (isEditing) {
      productService.clearEditingProduct();
      productService.setNotice("商品を更新しました。");
      if (typeof navigate === "function") {
        navigate(ROUTES.LEDGER);
      } else {
        page.replaceWith(renderProductRegisterPage());
      }
      return;
    }

    message.className = "notice is-success";
    message.textContent = "商品を保存しました。";
    message.hidden = false;
    resetForm();
  });

  form.appendChild(
    createPrimaryButton({
      label: isEditing ? "更新" : "保存",
      onClick: () => form.requestSubmit()
    })
  );

  if (isEditing) {
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "secondary-button";
    cancelButton.textContent = "新規登録に戻る";
    cancelButton.addEventListener("click", () => {
      productService.clearEditingProduct();
      page.replaceWith(renderProductRegisterPage());
    });
    form.appendChild(cancelButton);
  }

  const body = document.createElement("div");
  body.className = "page-stack";
  body.append(message, form);

  page.appendChild(createSectionCard({ title: "商品登録フォーム", body }));
  return page;
};
