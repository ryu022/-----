import { inventoryService } from "../services/inventoryService.js";
import { createSectionCard } from "../components/ui.js";
import { summaryService } from "../services/summaryService.js";
import { escapeHtml } from "../utils/security.js";

const CATEGORIES = ["鮮魚", "塩干", "資材"];
const ITEMS_PER_PAGE = 30;

const formatNumber = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  return numericValue.toLocaleString("ja-JP", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
};

const formatCurrency = (value) => `${Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}円`;

const buildRows = () => {
  const session = inventoryService.getActiveSession();

  return CATEGORIES.flatMap((category) => summaryService.getRowsByCategory(category, session?.sessionId));
};

const buildTotals = (rows) => {
  const byCategory = {};
  const byCategoryQuantity = {};
  const byCategoryAmount = {};

  CATEGORIES.forEach((category) => {
    const categoryRows = rows.filter((row) => row.product.category === category);
    byCategoryQuantity[category] = categoryRows.reduce((sum, row) => sum + row.totalQuantity, 0);
    byCategoryAmount[category] = categoryRows.reduce((sum, row) => sum + row.amount, 0);
    byCategory[category] = categoryRows;
  });

  const grandTotalQuantity = Object.values(byCategoryQuantity).reduce((sum, value) => sum + value, 0);
  const grandTotalAmount = Object.values(byCategoryAmount).reduce((sum, value) => sum + value, 0);

  return { byCategory, byCategoryQuantity, byCategoryAmount, grandTotalQuantity, grandTotalAmount };
};

const splitPages = (rows, perPage) => {
  if (!rows || rows.length === 0) {
    return [];
  }

  const pages = [];
  for (let i = 0; i < rows.length; i += perPage) {
    pages.push(rows.slice(i, i + perPage));
  }
  return pages;
};

const buildPrintData = (rows, storeName, inventoryDate) => {
  const totals = buildTotals(rows);
  const pages = [];

  const printableCategories = CATEGORIES.filter((category) => (totals.byCategory[category] ?? []).length > 0);

  printableCategories.forEach((category, categoryIndex) => {
    const categoryRows = totals.byCategory[category] ?? [];
    const categoryPages = splitPages(categoryRows, ITEMS_PER_PAGE);

    categoryPages.forEach((chunk, pageIndex) => {
      const pageNumber = pageIndex + 1;
      const totalPages = categoryPages.length;
      const isLastPage = pageNumber === totalPages;
      const startNo = pageIndex * ITEMS_PER_PAGE + 1;
      const pageRows = chunk.map((row, rowIndex) => ({
        ...row,
        no: startNo + rowIndex
      }));

      pages.push({
        category,
        pageNumber,
        totalPages,
        isLastPage,
        isNewDepartment: categoryIndex > 0 && pageNumber === 1,
        rows: pageRows,
        departmentTotalQuantity: totals.byCategoryQuantity[category] ?? 0,
        departmentTotalAmount: totals.byCategoryAmount[category] ?? 0,
        grandTotalQuantity: totals.grandTotalQuantity,
        grandTotalAmount: totals.grandTotalAmount,
        storeName,
        inventoryDate
      });
    });
  });

  return { pages, totals };
};

const exportCsv = (rows, storeName, inventoryDate) => {
  const header = ["店舗名", "棚卸日", "商品名", "売場数量", "バックヤード数量", "合計数量", "原価", "金額"];
  const lines = rows.map((row) => [
    storeName,
    inventoryDate,
    row.product.name,
    row.salesFloorQuantity,
    row.backyardQuantity,
    row.totalQuantity,
    row.product.cost,
    row.amount
  ]);

  const csv = [header, ...lines]
    .map((cols) => cols.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `inventory_${inventoryDate || "nodate"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const exportExcel = (rows, storeName, inventoryDate) => {
  const XLSX = window.XLSX;
  if (!XLSX) {
    window.alert("Excel出力ライブラリが読み込まれていません。");
    return;
  }

  const aoa = [
    ["店舗名", storeName],
    ["棚卸日", inventoryDate],
    [],
    ["商品名", "売場数量", "バックヤード数量", "合計数量", "原価", "金額"]
  ];

  rows.forEach((row) => {
    aoa.push([
      row.product.name,
      row.salesFloorQuantity,
      row.backyardQuantity,
      row.totalQuantity,
      row.product.cost,
      row.amount
    ]);
  });

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "棚卸データ");
  XLSX.writeFile(workbook, `inventory_${inventoryDate || "nodate"}.xlsx`);
};

export const renderPrintPage = () => {
  const page = document.createElement("div");
  page.className = "page-stack";
  const session = inventoryService.getActiveSession();
  const storeName = session?.storeName ?? "未開始";
  const inventoryDate = session?.inventoryDate ?? "未開始";
  const rows = buildRows();
  const printData = buildPrintData(rows, storeName, inventoryDate);

  const actions = document.createElement("div");
  actions.className = "print-actions";
  actions.innerHTML = `
    <button type="button" class="secondary-button" data-action="print">印刷 / PDF</button>
    <button type="button" class="secondary-button" data-action="csv">CSV出力</button>
    <button type="button" class="secondary-button" data-action="xlsx">Excel出力</button>
  `;

  actions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    if (action === "print") {
      window.print();
      return;
    }

    if (action === "csv") {
      exportCsv(rows, storeName, inventoryDate);
      return;
    }

    if (action === "xlsx") {
      exportExcel(rows, storeName, inventoryDate);
    }
  });

  const previewRoot = document.createElement("div");
  previewRoot.className = "print-preview-pages";

  if (printData.pages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "panel-card__text";
    empty.textContent = "印刷対象の棚卸データがありません。";
    previewRoot.appendChild(empty);
  }

  printData.pages.forEach((pageData) => {
    const sheet = document.createElement("section");
    sheet.className = `print-sheet print-page${pageData.isLastPage ? " is-last-page" : ""}${pageData.isNewDepartment ? " is-new-department" : ""}`;
    sheet.innerHTML = `
      <div class="print-sheet__header">
        <div class="print-sheet__meta">
          <div class="print-sheet__meta-row"><span class="print-sheet__meta-label">店舗名</span>${escapeHtml(pageData.storeName)}</div>
          <div class="print-sheet__meta-row"><span class="print-sheet__meta-label">棚卸実施日</span>${escapeHtml(pageData.inventoryDate)}</div>
          <div class="print-sheet__meta-row"><span class="print-sheet__meta-label">部門名</span>${escapeHtml(pageData.category)}</div>
        </div>
        <div class="print-sheet__center">
          <div class="print-sheet__title">棚卸表</div>
        </div>
        <div class="print-sheet__right">
          <div class="print-sheet__page">${pageData.category} ${pageData.pageNumber} / ${pageData.totalPages}</div>
          <div class="print-sheet__stamp">
            <div class="print-stamp__group">
              <div class="print-stamp__title">チーフ</div>
              <div class="print-stamp__box"></div>
            </div>
            <div class="print-stamp__group">
              <div class="print-stamp__title">計算者</div>
              <div class="print-stamp__box"></div>
            </div>
            <div class="print-stamp__group">
              <div class="print-stamp__title">店長</div>
              <div class="print-stamp__box"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="print-sheet__table-wrap">
        <table class="inventory-print-table">
          <thead>
            <tr>
              <th class="print-col-no">No.</th>
              <th class="print-col-name">商品名</th>
              <th class="print-col-spec">規格</th>
              <th class="print-col-qty">売場数量</th>
              <th class="print-col-qty">バックヤード数量</th>
              <th class="print-col-qty">合計数量</th>
              <th class="print-col-cost">原価</th>
              <th class="print-col-amount">金額</th>
            </tr>
          </thead>
          <tbody>
            ${pageData.rows
              .map(
                (row) => `
                  <tr>
                    <td>${row.no}</td>
                    <td class="print-col-name">${escapeHtml(row.product.name)}</td>
                    <td>${escapeHtml(row.product.standard ?? "-")}</td>
                    <td>${formatNumber(row.salesFloorQuantity)}</td>
                    <td>${formatNumber(row.backyardQuantity)}</td>
                    <td>${formatNumber(row.totalQuantity)}</td>
                    <td>${formatCurrency(row.product.cost)}</td>
                    <td>${formatCurrency(row.amount)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="print-sheet__footer">
        <div class="print-sheet__footer-item"><span>部門合計数量</span><strong>${formatNumber(pageData.departmentTotalQuantity)}</strong></div>
        <div class="print-sheet__footer-item"><span>部門合計金額</span><strong>${formatCurrency(pageData.departmentTotalAmount)}</strong></div>
        ${pageData.isLastPage ? `
          <div class="print-sheet__footer-item"><span>総合計数量</span><strong>${formatNumber(pageData.grandTotalQuantity)}</strong></div>
          <div class="print-sheet__footer-item"><span>総合計金額</span><strong>${formatCurrency(pageData.grandTotalAmount)}</strong></div>
        ` : ""}
      </div>
    `;

    previewRoot.appendChild(sheet);
  });

  const body = document.createElement("div");
  body.className = "page-stack";
  body.append(actions, previewRoot);
  page.appendChild(createSectionCard({ title: "A4縦 プレビュー", body }));
  return page;
};
