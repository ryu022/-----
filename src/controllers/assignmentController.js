import { createSectionCard, createTabBar } from "../components/ui.js";
import { assignmentService } from "../services/assignmentService.js";

const MODE_TABS = [
  { label: "売場", key: "salesFloor" },
  { label: "バックヤード", key: "backyard" },
  { label: "資材", key: "materials" }
];

const MODE_LABEL = {
  salesFloor: "売場",
  backyard: "バックヤード",
  materials: "資材"
};

export class AssignmentController {
  constructor({ productService }) {
    this.productService = productService;
    this.activeMode = MODE_TABS[0].key;
  }

  render() {
    const page = document.createElement("div");
    page.className = "page-stack";
    assignmentService.syncWithProducts(this.productService.listProducts());

    const notice = document.createElement("p");
    notice.className = "panel-card__text";
    notice.textContent = "棚卸対象をONにすると場所を選択できます。下部で場所ごとの棚卸順をドラッグして調整します。";

    const settingsHost = document.createElement("section");
    const orderHost = document.createElement("section");

    const rerender = () => {
      settingsHost.innerHTML = "";
      orderHost.innerHTML = "";
      settingsHost.appendChild(this.renderSettingsList(rerender));
      orderHost.appendChild(this.renderOrderManager(rerender));
    };

    rerender();
    page.append(notice, settingsHost, orderHost);
    return page;
  }

  renderSettingsList(rerender) {
    const products = this.productService.listProducts();
    const rows = assignmentService.listAll(products);

    const list = document.createElement("div");
    list.className = "assignment-settings-list";

    rows.forEach(({ product, assignment }) => {
      const card = document.createElement("article");
      card.className = "list-card";

      const head = document.createElement("div");
      head.className = "list-card__row";
      head.innerHTML = `<strong>${product.name}</strong><span>${product.id}</span>`;

      const meta = document.createElement("div");
      meta.className = "list-card__row";
      meta.innerHTML = `<span>規格: ${product.standard}</span><span>分類: ${product.category}</span>`;

      const checks = document.createElement("div");
      checks.className = "assignment-check-grid";

      const targetInput = this.createCheckbox({
        label: "棚卸対象",
        checked: assignment.isTarget,
        onChange: (checked) => {
          assignmentService.updateAssignment(product.id, { isTarget: checked });
          rerender();
        }
      });

      const salesInput = this.createCheckbox({
        label: "売場",
        checked: assignment.salesFloor,
        disabled: !assignment.isTarget,
        onChange: (checked) => {
          assignmentService.updateAssignment(product.id, { salesFloor: checked });
          rerender();
        }
      });

      const backyardInput = this.createCheckbox({
        label: "バックヤード",
        checked: assignment.backyard,
        disabled: !assignment.isTarget,
        onChange: (checked) => {
          assignmentService.updateAssignment(product.id, { backyard: checked });
          rerender();
        }
      });

      const materialsInput = this.createCheckbox({
        label: "資材",
        checked: assignment.materials,
        disabled: !assignment.isTarget,
        onChange: (checked) => {
          assignmentService.updateAssignment(product.id, { materials: checked });
          rerender();
        }
      });

      checks.append(targetInput, salesInput, backyardInput, materialsInput);
      card.append(head, meta, checks);
      list.appendChild(card);
    });

    const body = document.createElement("div");
    body.className = "page-stack";
    body.appendChild(list);

    return createSectionCard({ title: "商品振り分け一覧", body });
  }

  renderOrderManager(rerender) {
    const products = this.productService.listProducts();
    const listByMode = assignmentService.listByArea(products, this.activeMode);

    const wrap = document.createElement("div");
    wrap.className = "page-stack";

    wrap.appendChild(
      createTabBar({
        tabs: MODE_TABS.map((item) => item.label),
        activeTab: MODE_LABEL[this.activeMode],
        onTabChange: (label) => {
          const found = MODE_TABS.find((tab) => tab.label === label);
          if (!found) {
            return;
          }
          this.activeMode = found.key;
          rerender();
        }
      })
    );

    const dragList = document.createElement("div");
    dragList.className = "assignment-order-list";

    if (listByMode.length === 0) {
      const empty = document.createElement("p");
      empty.className = "panel-card__text";
      empty.textContent = "対象商品がありません。上の一覧で場所を選択してください。";
      wrap.appendChild(empty);
      return createSectionCard({ title: "棚卸順管理", body: wrap });
    }

    listByMode.forEach(({ product }, index) => {
      const item = document.createElement("article");
      item.className = "assignment-order-item";
      item.dataset.productId = product.id;

      item.innerHTML = `
        <div class="assignment-order-item__left">
          <button type="button" class="drag-handle" aria-label="${product.name} をドラッグして並び替え">::</button>
          <span class="assignment-order-rank">${index + 1}</span>
        </div>
        <div class="assignment-order-item__main">
          <strong>${product.name}</strong>
          <span>${product.category} / ${product.standard}</span>
        </div>
      `;

      dragList.appendChild(item);
    });

    this.bindPointerSort(dragList, () => {
      const orderedIds = Array.from(dragList.querySelectorAll(".assignment-order-item")).map((item) => item.dataset.productId);
      assignmentService.reorderArea(this.activeMode, orderedIds);
      rerender();
    });

    wrap.appendChild(dragList);
    return createSectionCard({ title: `棚卸順管理（${MODE_LABEL[this.activeMode]}モード）`, body: wrap });
  }

  createCheckbox({ label, checked, disabled = false, onChange }) {
    const row = document.createElement("label");
    row.className = `assignment-check ${disabled ? "is-disabled" : ""}`.trim();

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.disabled = disabled;
    input.addEventListener("change", () => onChange(input.checked));

    const text = document.createElement("span");
    text.textContent = label;

    row.append(input, text);
    return row;
  }

  bindPointerSort(container, onCommit) {
    let draggingItem = null;
    let lastDropTarget = null;

    const clearDropTarget = () => {
      if (lastDropTarget) {
        lastDropTarget.classList.remove("is-drop-target");
        lastDropTarget = null;
      }
    };

    const onMove = (event) => {
      if (!draggingItem) {
        return;
      }

      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".assignment-order-item");
      if (!target || target === draggingItem || !container.contains(target)) {
        clearDropTarget();
        return;
      }

      clearDropTarget();
      target.classList.add("is-drop-target");
      lastDropTarget = target;

      const rect = target.getBoundingClientRect();
      const insertBefore = event.clientY < rect.top + rect.height / 2;
      container.insertBefore(draggingItem, insertBefore ? target : target.nextSibling);
    };

    const onEnd = () => {
      if (!draggingItem) {
        return;
      }

      draggingItem.classList.remove("is-dragging");
      clearDropTarget();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      draggingItem = null;
      onCommit();
    };

    container.querySelectorAll(".drag-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        const item = event.currentTarget.closest(".assignment-order-item");
        if (!item) {
          return;
        }

        event.preventDefault();
        draggingItem = item;
        draggingItem.classList.add("is-dragging");
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerup", onEnd);
        window.addEventListener("pointercancel", onEnd);
      });
    });
  }
}
