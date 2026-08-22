import { ROUTES, ROUTE_TITLES } from "./config/constants.js";
import { initRouter, onRouteChange, getCurrentRoute, navigate } from "./utils/router.js";
import { renderLayout } from "./components/layout.js";
import { renderHomePage } from "./pages/homePage.js";
import { renderProductLedgerPage } from "./pages/productLedgerPage.js";
import { renderProductRegisterPage } from "./pages/productRegisterPage.js";
import { renderProductAllocationPage } from "./pages/productAllocationPage.js";
import { renderInventoryPage } from "./pages/inventoryPage.js";
import { renderPastInventoryPage } from "./pages/pastInventoryPage.js";
import { renderSummaryPage } from "./pages/summaryPage.js";
import { renderPrintPage } from "./pages/printPage.js";
import { productService } from "./services/productService.js";
import { assignmentService } from "./services/assignmentService.js";
import { inventoryService } from "./services/inventoryService.js";

const app = document.querySelector("#app");

const pageRenderers = {
  [ROUTES.HOME]: renderHomePage,
  [ROUTES.LEDGER]: renderProductLedgerPage,
  [ROUTES.REGISTER]: renderProductRegisterPage,
  [ROUTES.ALLOCATION]: renderProductAllocationPage,
  [ROUTES.INVENTORY]: renderInventoryPage,
  [ROUTES.HISTORY]: renderPastInventoryPage,
  [ROUTES.SUMMARY]: renderSummaryPage,
  [ROUTES.PRINT]: renderPrintPage
};

const render = (route) => {
  const title = ROUTE_TITLES[route] ?? ROUTE_TITLES[ROUTES.HOME];
  const canGoBack = route !== ROUTES.HOME;
  const renderPage = pageRenderers[route] ?? pageRenderers[ROUTES.HOME];

  app.innerHTML = "";
  app.appendChild(
    renderLayout({
      title,
      canGoBack,
      onBack: () => window.history.back(),
      content: renderPage({ navigate })
    })
  );

  attachNetworkStatus();
};

const attachNetworkStatus = () => {
  const node = document.querySelector("[data-network-status]");
  if (!node) {
    return;
  }

  window.removeEventListener("repo:network", window.__inventoryRepoStatusHandler__);

  const handler = (event) => {
    const detail = event.detail ?? {};
    if (detail.status === "loading") {
      node.hidden = false;
      node.className = "network-status is-loading";
      node.textContent = "通信中...";
      return;
    }

    if (detail.status === "error") {
      node.hidden = false;
      node.className = "network-status is-error";
      node.textContent = `通信失敗: ${detail.message ?? "不明なエラー"}`;
      return;
    }

    node.className = "network-status is-success";
    node.textContent = "同期完了";
    window.setTimeout(() => {
      node.hidden = true;
    }, 900);
  };

  window.__inventoryRepoStatusHandler__ = handler;
  window.addEventListener("repo:network", handler);
};

onRouteChange(render);

// ホーム画面はGAS同期を必要としないため、先に描画してから同期をバックグラウンドで実行する。
initRouter();
render(getCurrentRoute());

const initServices = async () => {
  try {
    // productとinventoryは互いに独立しているため並列実行し、assignmentはproduct完了後に実行する。
    const productInit = productService.initialize();
    const inventoryInit = inventoryService.initialize();

    await productInit;
    await assignmentService.initialize(productService.listProducts());
    await inventoryInit;
  } catch (error) {
    console.error("Service initialization failed:", error);
  }
};

initServices();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service Worker registration failed:", error);
    });
  });
}
