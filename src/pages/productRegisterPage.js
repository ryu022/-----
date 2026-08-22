import { PRODUCT_CATEGORIES, PRODUCT_STANDARDS, SUPPLIERS } from "../config/productMasterConstants.js";
import { ROUTES } from "../config/constants.js";
import { createPrimaryButton, createSectionCard } from "../components/ui.js";
import { productService } from "../services/productService.js";

const BULK_INITIAL_ROW_COUNT = 10;
// Excel貼り付けで自動展開する列(商品名・規格・カテゴリ・原価の4列、仕入先は既存プルダウンから選択)。
const BULK_PASTE_COLUMNS = ["name", "standard", "category", "cost"];

const createEmptyBulkRow = () => ({ name: "", standard: "", category: "", cost: "", supplier: "" });

const hasAnyBulkValue = (row) =>
  Boolean(row.name.trim() || row.standard.trim() || row.category.trim() || row.cost.trim() || row.supplier.trim());

const parseClipboardText = (text) => {
  const normalized = text.replace(/\r/g, "");
  const lines = normalized.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.map((line) => line.split("\t"));
};

const renderNormalRegisterSection = ({ navigate, onCancelEdit }) => {
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
        onCancelEdit();
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
      onCancelEdit();
    });
    form.appendChild(cancelButton);
  }

  const body = document.createElement("div");
  body.className = "page-stack";
  body.append(message, form);

  return createSectionCard({ title: "商品登録フォーム", body });
};

const renderBulkRegisterSection = () => {
  let rows = Array.from({ length: BULK_INITIAL_ROW_COUNT }, createEmptyBulkRow);
  const rowErrors = new Map();
  let resultSummary = null;
  let resultDetails = [];

  const resultBox = document.createElement("div");
  resultBox.className = "notice";
  resultBox.hidden = true;

  const resultList = document.createElement("ul");
  resultList.className = "bulk-result-list";
  resultList.hidden = true;

  const tableWrap = document.createElement("div");
  tableWrap.className = "bulk-register-table-wrap";

  const renderResult = () => {
    if (!resultSummary) {
      resultBox.hidden = true;
      resultList.hidden = true;
      return;
    }

    resultBox.hidden = false;
    resultBox.className = resultSummary.failCount > 0 ? "notice is-error" : "notice is-success";
    resultBox.textContent = `対象${resultSummary.totalCount}件中${resultSummary.successCount}件登録しました（失敗: ${resultSummary.failCount}件）`;

    resultList.innerHTML = "";
    if (resultDetails.length === 0) {
      resultList.hidden = true;
    } else {
      resultList.hidden = false;
      resultDetails.forEach((detail) => {
        const li = document.createElement("li");
        li.textContent = `${detail.row}行目 ${detail.name || "(商品名未入力)"}: ${detail.message}`;
        resultList.appendChild(li);
      });
    }
  };

  const renderTable = () => {
    tableWrap.innerHTML = "";

    const table = document.createElement("table");
    table.className = "bulk-register-table";

    table.innerHTML = `
      <thead>
        <tr>
          <th>商品コード</th>
          <th>商品名</th>
          <th>規格</th>
          <th>カテゴリ</th>
          <th>原価</th>
          <th>仕入先</th>
          <th>操作</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement("tbody");

    rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      if (rowErrors.has(row)) {
        tr.classList.add("has-error");
      }

      const codeCell = document.createElement("td");
      codeCell.className = "bulk-register-row-code";
      codeCell.textContent = "自動採番";
      tr.appendChild(codeCell);

      const attachPasteHandler = (input, colIndex) => {
        input.addEventListener("paste", (event) => {
          const text = event.clipboardData?.getData("text/plain") ?? "";
          if (!text.includes("\t") && !text.includes("\n")) {
            return;
          }

          event.preventDefault();

          const dataLines = parseClipboardText(text);
          if (dataLines.length === 0) {
            return;
          }

          while (rows.length < rowIndex + dataLines.length) {
            rows.push(createEmptyBulkRow());
          }

          dataLines.forEach((cells, offset) => {
            const targetRow = rows[rowIndex + offset];
            cells.forEach((rawValue, cellOffset) => {
              const targetKey = BULK_PASTE_COLUMNS[colIndex + cellOffset];
              if (!targetKey) {
                return;
              }

              const value = rawValue.trim();
              if (targetKey === "category") {
                targetRow.category = PRODUCT_CATEGORIES.includes(value) ? value : "";
              } else {
                targetRow[targetKey] = value;
              }
            });
          });

          renderTable();
        });
      };

      const nameCell = document.createElement("td");
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "text-input";
      nameInput.placeholder = "例: 真あじ";
      nameInput.value = row.name;
      nameInput.addEventListener("input", (event) => {
        row.name = event.target.value;
      });
      attachPasteHandler(nameInput, 0);
      nameCell.appendChild(nameInput);
      tr.appendChild(nameCell);

      const standardCell = document.createElement("td");
      const standardInput = document.createElement("input");
      standardInput.type = "text";
      standardInput.className = "text-input";
      standardInput.placeholder = "例: kg";
      standardInput.value = row.standard;
      standardInput.addEventListener("input", (event) => {
        row.standard = event.target.value;
      });
      attachPasteHandler(standardInput, 1);
      standardCell.appendChild(standardInput);
      tr.appendChild(standardCell);

      const categoryCell = document.createElement("td");
      const categorySelect = document.createElement("select");
      categorySelect.className = "select-input";
      categorySelect.innerHTML = `
        <option value="">選択してください</option>
        ${PRODUCT_CATEGORIES.map((category) => `<option value="${category}" ${row.category === category ? "selected" : ""}>${category}</option>`).join("")}
      `;
      categorySelect.addEventListener("change", (event) => {
        row.category = event.target.value;
      });
      categoryCell.appendChild(categorySelect);
      tr.appendChild(categoryCell);

      const costCell = document.createElement("td");
      const costInput = document.createElement("input");
      costInput.type = "number";
      costInput.className = "number-input";
      costInput.min = "1";
      costInput.placeholder = "例: 280";
      costInput.value = row.cost;
      costInput.addEventListener("input", (event) => {
        row.cost = event.target.value;
      });
      attachPasteHandler(costInput, 3);
      costCell.appendChild(costInput);
      tr.appendChild(costCell);

      const supplierCell = document.createElement("td");
      const supplierSelect = document.createElement("select");
      supplierSelect.className = "select-input";
      supplierSelect.innerHTML = `
        <option value="">選択してください</option>
        ${SUPPLIERS.map((supplier) => `<option value="${supplier}" ${row.supplier === supplier ? "selected" : ""}>${supplier}</option>`).join("")}
      `;
      supplierSelect.addEventListener("change", (event) => {
        row.supplier = event.target.value;
      });
      supplierCell.appendChild(supplierSelect);
      tr.appendChild(supplierCell);

      const actionCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "secondary-button";
      deleteButton.textContent = "行削除";
      deleteButton.addEventListener("click", () => {
        rowErrors.delete(row);
        rows.splice(rowIndex, 1);
        if (rows.length === 0) {
          rows.push(createEmptyBulkRow());
        }
        renderTable();
      });
      actionCell.appendChild(deleteButton);
      tr.appendChild(actionCell);

      tbody.appendChild(tr);

      if (rowErrors.has(row)) {
        const errorTr = document.createElement("tr");
        errorTr.className = "has-error";
        const errorTd = document.createElement("td");
        errorTd.colSpan = 7;
        errorTd.className = "bulk-row-error";
        errorTd.textContent = `${rowIndex + 1}行目: ${rowErrors.get(row)}`;
        errorTr.appendChild(errorTd);
        tbody.appendChild(errorTr);
      }
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  };

  const toolbar = document.createElement("div");
  toolbar.className = "bulk-register-toolbar";

  const addRowButton = document.createElement("button");
  addRowButton.type = "button";
  addRowButton.className = "secondary-button";
  addRowButton.textContent = "行を追加";
  addRowButton.addEventListener("click", () => {
    rows.push(createEmptyBulkRow());
    renderTable();
  });

  const submitButton = createPrimaryButton({
    label: "一括登録",
    onClick: async () => {
      const targets = rows.filter(hasAnyBulkValue);

      if (targets.length === 0) {
        window.alert("登録する商品を1件以上入力してください。");
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "登録中...";
      rowErrors.clear();

      const result = await productService.createProductsBulk(targets);

      resultDetails = result.errors.map((error) => ({
        row: error.row,
        name: error.name,
        message: error.message
      }));

      result.errors.forEach((error) => {
        const targetRow = targets[error.row - 1];
        if (targetRow) {
          rowErrors.set(targetRow, error.message);
        }
      });

      resultSummary = {
        totalCount: targets.length,
        successCount: result.successCount,
        failCount: result.failCount
      };

      // 成功した行(エラーなし)は一覧から取り除き、失敗した行と未入力の空行は残す。
      rows = rows.filter((row) => !targets.includes(row) || rowErrors.has(row));
      if (!rows.some((row) => !hasAnyBulkValue(row))) {
        rows.push(createEmptyBulkRow());
      }

      submitButton.disabled = false;
      submitButton.textContent = "一括登録";

      renderResult();
      renderTable();
    }
  });

  toolbar.append(addRowButton, submitButton);

  renderTable();

  const body = document.createElement("div");
  body.className = "page-stack";
  body.append(resultBox, resultList, toolbar, tableWrap);

  return createSectionCard({ title: "商品一括登録(Excel貼り付け対応)", body });
};

export const renderProductRegisterPage = ({ navigate } = {}) => {
  const page = document.createElement("div");
  page.className = "page-stack";

  const editingProduct = productService.getEditingProduct();
  const isEditing = Boolean(editingProduct);

  const contentHost = document.createElement("div");
  let activeMode = "normal";

  const modeToggle = document.createElement("div");
  modeToggle.className = "bulk-register-toolbar";

  const normalModeButton = document.createElement("button");
  normalModeButton.type = "button";
  normalModeButton.textContent = "通常登録";

  const bulkModeButton = document.createElement("button");
  bulkModeButton.type = "button";
  bulkModeButton.textContent = "一括登録";

  const applyModeButtonStyles = () => {
    normalModeButton.className = activeMode === "normal" ? "primary-button" : "secondary-button";
    bulkModeButton.className = activeMode === "bulk" ? "primary-button" : "secondary-button";
  };

  const renderContent = () => {
    contentHost.innerHTML = "";

    if (activeMode === "bulk") {
      contentHost.appendChild(renderBulkRegisterSection());
      return;
    }

    const section = renderNormalRegisterSection({
      navigate,
      onCancelEdit: () => {
        page.replaceWith(renderProductRegisterPage({ navigate }));
      }
    });
    contentHost.appendChild(section);
  };

  normalModeButton.addEventListener("click", () => {
    if (activeMode === "normal") {
      return;
    }
    activeMode = "normal";
    applyModeButtonStyles();
    renderContent();
  });

  bulkModeButton.addEventListener("click", () => {
    if (activeMode === "bulk") {
      return;
    }
    activeMode = "bulk";
    applyModeButtonStyles();
    renderContent();
  });

  modeToggle.append(normalModeButton, bulkModeButton);
  applyModeButtonStyles();
  renderContent();

  page.appendChild(modeToggle);
  page.appendChild(contentHost);

  // 編集中は既存の編集フローを優先し、一括登録への切り替えは表示しない。
  if (isEditing) {
    modeToggle.hidden = true;
  }

  return page;
};
