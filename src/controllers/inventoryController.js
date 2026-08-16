import { createPrimaryButton, createSectionCard, createTabBar } from "../components/ui.js";
import { inventoryService, LOCATION_TABS } from "../services/inventoryService.js";
import { escapeHtml } from "../utils/security.js";

const formatQuantity = (value) => {
  if (!Number.isFinite(Number(value))) {
    return "0";
  }

  const normalized = Number(value);
  return Number.isInteger(normalized) ? String(normalized) : String(normalized);
};

export class InventoryController {
  constructor() {
    this.activeLocation = LOCATION_TABS[0].key;
    this.saveTimers = new Map();
  }

  render() {
    const page = document.createElement("div");
    page.className = "page-stack";

    const session = inventoryService.getActiveSession();
    if (!session) {
      page.appendChild(this.createStartCard(() => {
        page.replaceWith(this.render());
      }));
      return page;
    }

    const meta = this.createSessionMeta(session);
    const editor = this.createEditor(session);
    const completeButton = this.createCompleteButton(async () => {
      const confirmed = window.confirm(
        "棚卸を完了しますか？\n\n棚卸を完了すると、この棚卸データを過去の棚卸データとして保存します。"
      );

      if (!confirmed) {
        return;
      }

      const result = await inventoryService.completeActiveSession();
      if (!result.success) {
        window.alert(result.error || "棚卸完了に失敗しました。");
        return;
      }

      window.alert("棚卸を完了しました。過去の棚卸に保存されました。");
      page.replaceWith(this.render());
    });

    page.append(meta, editor, completeButton);
    return page;
  }

  createStartCard(onStarted) {
    const form = document.createElement("form");
    form.className = "field-grid";
    form.noValidate = true;

    const errors = document.createElement("div");
    errors.className = "field-grid";

    form.innerHTML = `
      <div class="field">
        <label for="storeName">店舗名</label>
        <input id="storeName" class="text-input" type="text" placeholder="例: 本店" />
        <small class="field-error" data-error="storeName"></small>
      </div>
      <div class="field">
        <label for="inventoryDate">棚卸日</label>
        <input id="inventoryDate" class="date-input" type="text" inputmode="numeric" placeholder="例: 2026-07-30" />
        <small class="field-error" data-error="inventoryDate"></small>
      </div>
    `;

    const clearErrors = () => {
      form.querySelectorAll("[data-error]").forEach((node) => {
        node.textContent = "";
      });
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearErrors();

      const result = await inventoryService.startSession({
        storeName: form.querySelector("#storeName").value,
        inventoryDate: form.querySelector("#inventoryDate").value
      });

      if (!result.success) {
        if (result.errors) {
          Object.entries(result.errors).forEach(([key, message]) => {
            const node = form.querySelector(`[data-error=\"${key}\"]`);
            if (node) {
              node.textContent = message;
            }
          });
        } else if (result.error) {
          const node = form.querySelector('[data-error="storeName"]');
          if (node) {
            node.textContent = result.error;
          }
        }
        return;
      }

      onStarted();
    });

    form.appendChild(
      createPrimaryButton({
        label: "開始",
        onClick: () => form.requestSubmit()
      })
    );

    const body = document.createElement("div");
    body.className = "page-stack";
    body.append(errors, form);
    return createSectionCard({ title: "棚卸開始", body });
  }

  createSessionMeta(session) {
    const meta = document.createElement("section");
    meta.className = "inventory-meta";
    meta.innerHTML = `
      <div><strong>店舗名:</strong> ${escapeHtml(session.storeName)}</div>
      <div><strong>棚卸日:</strong> ${escapeHtml(session.inventoryDate)}</div>
      <div><strong>ステータス:</strong> ${escapeHtml(session.status || "draft")}</div>
      <div class="inventory-save-state" data-save-state>保存状態: 待機中</div>
    `;
    return meta;
  }

  createCompleteButton(onComplete) {
    const wrap = document.createElement("div");
    wrap.className = "inventory-complete-wrap";

    const button = createPrimaryButton({
      label: "棚卸完了",
      onClick: onComplete
    });

    button.classList.add("inventory-complete-button");
    wrap.appendChild(button);
    return wrap;
  }

  createEditor() {
    const wrap = document.createElement("div");
    wrap.className = "page-stack";

    const tabHost = document.createElement("div");
    const listHost = document.createElement("div");

    const renderList = () => {
      listHost.innerHTML = "";
      const rows = inventoryService.listProductsForLocation(this.activeLocation);

      if (rows.length === 0) {
        const empty = document.createElement("p");
        empty.className = "panel-card__text";
        empty.textContent = "この場所に棚卸対象の商品がありません。商品振り分けで設定してください。";
        listHost.appendChild(empty);
        return;
      }

      const list = document.createElement("div");
      list.className = "inventory-list";
      list.dataset.location = this.activeLocation;

      rows.forEach(({ product, quantity }, index) => {
        const card = document.createElement("article");
        card.className = "list-card inventory-item";
        card.innerHTML = `
          <div class="list-card__row">
            <strong>${product.name}</strong>
            <span>${product.standard}</span>
          </div>
          <div class="field">
            <label>数量</label>
            <input
              class="number-input inventory-qty-input"
              data-product-id="${product.id}"
              data-index="${index}"
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              placeholder="0"
              value="${formatQuantity(quantity)}"
            />
          </div>
        `;
        list.appendChild(card);
      });

      this.bindListEvents(list);
      listHost.appendChild(list);
    };

    const renderTabs = () => {
      tabHost.innerHTML = "";
      tabHost.appendChild(
        createTabBar({
          tabs: LOCATION_TABS.map((tab) => tab.label),
          activeTab: LOCATION_TABS.find((tab) => tab.key === this.activeLocation)?.label,
          onTabChange: (label) => {
            const found = LOCATION_TABS.find((tab) => tab.label === label);
            if (!found) {
              return;
            }
            this.activeLocation = found.key;
            renderTabs();
            renderList();
          }
        })
      );
    };

    renderTabs();
    renderList();
    wrap.append(tabHost, listHost);
    return createSectionCard({ title: "棚卸実施", body: wrap });
  }

  bindListEvents(listElement) {
    const findSaveState = () => document.querySelector("[data-save-state]");

    const moveToNext = (currentInput) => {
      const inputs = Array.from(listElement.querySelectorAll(".inventory-qty-input"));
      const index = inputs.indexOf(currentInput);
      const next = inputs[index + 1];
      if (next) {
        next.focus();
        next.select();
      }
    };

    const scheduleSave = (input) => {
      const locationKey = listElement.dataset.location;
      const productId = input.dataset.productId;
      const raw = input.value.trim();
      const quantity = raw === "" ? 0 : Number(raw);
      const saveState = findSaveState();
      const timerKey = `${locationKey}:${productId}`;

      if (this.saveTimers.has(timerKey)) {
        window.clearTimeout(this.saveTimers.get(timerKey));
      }

      if (saveState) {
        saveState.textContent = "保存状態: 保存中...";
      }

      const timerId = window.setTimeout(async () => {
        const result = await inventoryService.saveQuantity({ productId, locationKey, quantity });
        if (saveState) {
          saveState.textContent = result.success
            ? result.changed
              ? "保存状態: 保存済み"
              : "保存状態: 変更なし"
            : result.error || "保存状態: 入力エラー";
        }
        this.saveTimers.delete(timerKey);
      }, 120);

      this.saveTimers.set(timerKey, timerId);
    };

    listElement.addEventListener("input", (event) => {
      const input = event.target.closest(".inventory-qty-input");
      if (!input) {
        return;
      }

      scheduleSave(input);
    });

    listElement.addEventListener("change", (event) => {
      const input = event.target.closest(".inventory-qty-input");
      if (!input) {
        return;
      }

      moveToNext(input);
    });

    listElement.addEventListener("keydown", (event) => {
      const input = event.target.closest(".inventory-qty-input");
      if (!input) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        moveToNext(input);
      }
    });
  }
}
