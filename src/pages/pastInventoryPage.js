import { createPrimaryButton, createSectionCard, createTabBar } from "../components/ui.js";
import { PRODUCT_CATEGORIES } from "../config/productMasterConstants.js";
import { inventoryService } from "../services/inventoryService.js";
import { summaryService } from "../services/summaryService.js";

const formatYen = (value) => `${Number(value || 0).toLocaleString("ja-JP")}円`;

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP");
};

const makeDraftMap = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    map.set(row.product.id, {
      salesFloor: row.salesFloorQuantity,
      backyard: row.backyardQuantity,
      materials: row.materialsQuantity
    });
  });
  return map;
};

export const renderPastInventoryPage = () => {
  const page = document.createElement("div");
  page.className = "page-stack";

  let sessions = inventoryService.listSessions();
  let selectedSessionId = "";
  let activeCategory = PRODUCT_CATEGORIES[0];
  let isEditMode = false;
  let draftMap = new Map();

  const rerender = () => {
    page.innerHTML = "";
    if (!selectedSessionId) {
      page.appendChild(renderListView());
      return;
    }

    page.appendChild(renderDetailView(selectedSessionId));
  };

  const refreshSessions = () => {
    sessions = inventoryService.listSessions();
  };

  const renderListView = () => {
    const wrap = document.createElement("div");
    wrap.className = "page-stack";

    const list = document.createElement("div");
    list.className = "history-list";

    if (sessions.length === 0) {
      list.innerHTML = '<p class="panel-card__text">過去の棚卸データはありません。</p>';
    } else {
      sessions.forEach((session) => {
        const item = document.createElement("article");
        item.className = "list-card history-item";
        item.innerHTML = `
          <div class="history-item__head">
            <label class="history-check">
              <input type="checkbox" data-session-check="${session.sessionId}" />
              <span>選択</span>
            </label>
            <button type="button" class="secondary-button" data-open-session="${session.sessionId}">開く</button>
          </div>
          <div><strong>棚卸日:</strong> ${session.inventoryDate || "-"}</div>
          <div><strong>店舗名:</strong> ${session.storeName || "-"}</div>
          <div><strong>ステータス:</strong> ${session.status || "draft"}</div>
          <div><strong>完了日時:</strong> ${formatDateTime(session.completedAt)}</div>
        `;
        list.appendChild(item);
      });
    }

    list.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-open-session]");
      if (!button) {
        return;
      }

      selectedSessionId = button.dataset.openSession;
      isEditMode = false;
      draftMap = new Map();
      rerender();
    });

    const deleteButton = createPrimaryButton({
      label: "選択削除",
      onClick: async () => {
        const checked = Array.from(list.querySelectorAll("input[data-session-check]:checked"));
        const sessionIds = checked.map((node) => node.getAttribute("data-session-check"));

        if (sessionIds.length === 0) {
          window.alert("削除する棚卸を選択してください。");
          return;
        }

        const confirmed = window.confirm(`${sessionIds.length}件の棚卸データを削除しますか？`);
        if (!confirmed) {
          return;
        }

        const result = await inventoryService.deleteSessionsByIds(sessionIds);
        if (!result.success) {
          window.alert(result.error || "削除に失敗しました。");
          return;
        }

        refreshSessions();
        rerender();
      }
    });

    deleteButton.classList.add("history-delete-button");

    wrap.appendChild(
      createSectionCard({
        title: "過去の棚卸一覧",
        body: (() => {
          const body = document.createElement("div");
          body.className = "page-stack";
          body.append(list, deleteButton);
          return body;
        })()
      })
    );

    return wrap;
  };

  const renderDetailView = (sessionId) => {
    const session = inventoryService.getSessionById(sessionId);
    const wrap = document.createElement("div");
    wrap.className = "page-stack";

    if (!session) {
      const fallback = document.createElement("div");
      fallback.className = "page-stack";
      fallback.innerHTML = '<p class="panel-card__text">対象の棚卸データが見つかりません。</p>';
      const back = createPrimaryButton({
        label: "一覧へ戻る",
        onClick: () => {
          selectedSessionId = "";
          rerender();
        }
      });
      fallback.appendChild(back);
      return createSectionCard({ title: "過去の棚卸", body: fallback });
    }

    const rows = summaryService.getRowsByCategory(activeCategory, sessionId);
    const { categoryTotals, grandTotal } = summaryService.getCategoryTotals(sessionId);
    const editableLocationKeys = inventoryService.getEditableLocationKeysByCategory(activeCategory);

    if (!isEditMode || draftMap.size === 0) {
      draftMap = makeDraftMap(rows);
    }

    const controls = document.createElement("div");
    controls.className = "history-detail-controls";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "secondary-button";
    backButton.textContent = "一覧へ戻る";
    backButton.addEventListener("click", () => {
      selectedSessionId = "";
      isEditMode = false;
      draftMap = new Map();
      refreshSessions();
      rerender();
    });
    controls.appendChild(backButton);

    if (!isEditMode) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "secondary-button";
      editButton.textContent = "編集";
      editButton.addEventListener("click", () => {
        if ((session.status || "draft") === "completed") {
          const confirmed = window.confirm("完了済みの棚卸を編集しますか？");
          if (!confirmed) {
            return;
          }
        }

        isEditMode = true;
        draftMap = makeDraftMap(rows);
        rerender();
      });
      controls.appendChild(editButton);
    } else {
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "secondary-button";
      saveButton.textContent = "保存";
      saveButton.addEventListener("click", async () => {
        const updates = [];

        rows.forEach((row) => {
          const draft = draftMap.get(row.product.id) ?? {
            salesFloor: row.salesFloorQuantity,
            backyard: row.backyardQuantity,
            materials: row.materialsQuantity
          };

          editableLocationKeys.forEach((locationKey) => {
            const previous =
              locationKey === "salesFloor"
                ? row.salesFloorQuantity
                : locationKey === "backyard"
                  ? row.backyardQuantity
                  : row.materialsQuantity;

            const next = Number(draft[locationKey] ?? 0);
            if (Number(previous) === next) {
              return;
            }

            updates.push(
              inventoryService.saveQuantityForSession({
                sessionId,
                productId: row.product.id,
                locationKey,
                quantity: next
              })
            );
          });
        });

        for (const update of updates) {
          const result = await update;
          if (!result.success) {
            window.alert(result.error || "保存に失敗しました。");
            return;
          }
        }

        isEditMode = false;
        refreshSessions();
        rerender();
      });
      controls.appendChild(saveButton);

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "secondary-button";
      cancelButton.textContent = "キャンセル";
      cancelButton.addEventListener("click", () => {
        isEditMode = false;
        draftMap = makeDraftMap(rows);
        rerender();
      });
      controls.appendChild(cancelButton);
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "history-table-wrap";

    const isMaterials = activeCategory === "資材";

    const table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>${isMaterials ? "資材商品" : "商品名"}</th>
          ${isMaterials ? "<th>数量</th>" : "<th>売場数量</th><th>バックヤード数量</th><th>合計数量</th>"}
          <th>原価</th>
          <th>金額</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");
    rows.forEach((row) => {
      const draft = draftMap.get(row.product.id) ?? {
        salesFloor: row.salesFloorQuantity,
        backyard: row.backyardQuantity,
        materials: row.materialsQuantity
      };

      const tr = document.createElement("tr");
      const totalQuantity = isMaterials ? Number(draft.materials || 0) : Number(draft.salesFloor || 0) + Number(draft.backyard || 0);
      const amount = Number(row.product.cost || 0) * totalQuantity;

      tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.product.name }));

      const makeInputCell = (locationKey, value) => {
        const td = document.createElement("td");
        if (!isEditMode) {
          td.textContent = String(value);
          return td;
        }

        const input = document.createElement("input");
        input.type = "number";
        input.className = "number-input history-qty-input";
        input.min = "0";
        input.step = "any";
        input.value = String(value);
        input.addEventListener("input", () => {
          const numeric = Number(input.value);
          const safeValue = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
          const current = draftMap.get(row.product.id) ?? { salesFloor: 0, backyard: 0, materials: 0 };
          current[locationKey] = safeValue;
          draftMap.set(row.product.id, current);
        });
        td.appendChild(input);
        return td;
      };

      if (isMaterials) {
        tr.appendChild(makeInputCell("materials", draft.materials));
      } else {
        tr.appendChild(makeInputCell("salesFloor", draft.salesFloor));
        tr.appendChild(makeInputCell("backyard", draft.backyard));
        tr.appendChild(Object.assign(document.createElement("td"), { textContent: String(totalQuantity) }));
      }

      tr.appendChild(Object.assign(document.createElement("td"), { textContent: formatYen(row.product.cost) }));
      tr.appendChild(Object.assign(document.createElement("td"), { textContent: formatYen(amount) }));
      tbody.appendChild(tr);
    });

    tableWrap.appendChild(table);

    const footer = document.createElement("div");
    footer.className = "summary-footer";
    footer.innerHTML = `
      <div>鮮魚合計: ${formatYen(categoryTotals["鮮魚"] ?? 0)}</div>
      <div>塩干合計: ${formatYen(categoryTotals["塩干"] ?? 0)}</div>
      <div>資材合計: ${formatYen(categoryTotals["資材"] ?? 0)}</div>
      <div>総合計: ${formatYen(grandTotal)}</div>
    `;

    const meta = document.createElement("div");
    meta.className = "field-grid";
    meta.innerHTML = `
      <div><strong>店舗名:</strong> ${session.storeName || "-"}</div>
      <div><strong>棚卸日:</strong> ${session.inventoryDate || "-"}</div>
      <div><strong>ステータス:</strong> ${session.status || "draft"}</div>
      <div><strong>完了日時:</strong> ${formatDateTime(session.completedAt)}</div>
    `;

    const tabBar = createTabBar({
      tabs: PRODUCT_CATEGORIES,
      activeTab: activeCategory,
      onTabChange: (tab) => {
        activeCategory = tab;
        draftMap = new Map();
        rerender();
      }
    });

    const body = document.createElement("div");
    body.className = "page-stack";
    body.append(meta, controls, tabBar, tableWrap, footer);

    wrap.appendChild(createSectionCard({ title: "過去の棚卸詳細", body }));
    return wrap;
  };

  rerender();
  return page;
};