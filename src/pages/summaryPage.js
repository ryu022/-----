import { PRODUCT_CATEGORIES } from "../config/productMasterConstants.js";
import { createSectionCard, createTabBar } from "../components/ui.js";
import { summaryService } from "../services/summaryService.js";

const formatYen = (value) => `${value.toLocaleString("ja-JP")}円`;

export const renderSummaryPage = () => {
  const page = document.createElement("div");
  page.className = "page-stack";

  let activeCategory = PRODUCT_CATEGORIES[0];

  const tabHost = document.createElement("div");
  const tableHost = document.createElement("div");

  const renderTable = () => {
    tableHost.innerHTML = "";
    const rows = summaryService.getRowsByCategory(activeCategory);
    const { categoryTotals, grandTotal } = summaryService.getCategoryTotals();
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
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${row.product.name}</td>
            ${isMaterials ? `<td>${row.materialsQuantity}</td>` : `<td>${row.salesFloorQuantity}</td><td>${row.backyardQuantity}</td><td>${row.totalQuantity}</td>`}
            <td>${formatYen(row.product.cost)}</td>
            <td>${formatYen(row.amount)}</td>
          </tr>
        `).join("")}
      </tbody>
    `;

    const footer = document.createElement("div");
    footer.className = "summary-footer";
    footer.innerHTML = `
      <div>鮮魚合計: ${formatYen(categoryTotals["鮮魚"] ?? 0)}</div>
      <div>塩干合計: ${formatYen(categoryTotals["塩干"] ?? 0)}</div>
      <div>資材合計: ${formatYen(categoryTotals["資材"] ?? 0)}</div>
      <div>総合計: ${formatYen(grandTotal)}</div>
    `;

    const body = document.createElement("div");
    body.className = "page-stack";
    body.append(table, footer);

    tableHost.appendChild(createSectionCard({ title: `${activeCategory} 集計`, body }));
  };

  const renderTabs = () => {
    tabHost.innerHTML = "";
    tabHost.appendChild(
      createTabBar({
        tabs: PRODUCT_CATEGORIES,
        activeTab: activeCategory,
        onTabChange: (category) => {
          activeCategory = category;
          renderTabs();
          renderTable();
        }
      })
    );
  };

  renderTabs();
  renderTable();
  page.append(tabHost, tableHost);
  return page;
};
