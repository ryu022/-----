import { LEDGER_TABS, ROUTES } from "../config/constants.js";
import { createSectionCard, createTabBar } from "../components/ui.js";
import { productService } from "../services/productService.js";

const createListCard = ({ product, onEdit, onDelete }) => {
  const card = document.createElement("article");
  card.className = "list-card";

  const head = document.createElement("div");
  head.className = "list-card__row";
  head.innerHTML = `<strong>${product.name}</strong><span>${product.id}</span>`;

  const specs = document.createElement("div");
  specs.className = "list-card__row";
  specs.innerHTML = `<span>規格: ${product.standard}</span><span>分類: ${product.category}</span>`;

  const meta = document.createElement("div");
  meta.className = "list-card__row";
  meta.innerHTML = `<span>${product.supplier}</span><span>原価: ${product.cost}円</span>`;

  const actions = document.createElement("div");
  actions.className = "list-card__actions";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "secondary-button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", onEdit);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "secondary-button";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", onDelete);

  actions.append(editButton, deleteButton);

  card.append(head, specs, meta, actions);
  return card;
};

export const renderProductLedgerPage = ({ navigate }) => {
  const page = document.createElement("div");
  page.className = "page-stack";

  let activeTab = LEDGER_TABS[0];
  let keyword = "";
  const flashMessage = productService.consumeNotice();

  const tabWrap = document.createElement("section");
  const listWrap = document.createElement("section");
  const searchWrap = document.createElement("section");

  const search = document.createElement("input");
  search.className = "text-input";
  search.placeholder = "商品名 / 分類 / 仕入先で検索";
  search.type = "search";
  search.addEventListener("input", (event) => {
    keyword = event.target.value;
    renderList();
  });

  const renderList = () => {
    listWrap.innerHTML = "";
    const target = productService.searchProducts({
      keyword,
      category: activeTab
    });

    const body = document.createElement("div");
    body.className = "page-stack";

    if (target.length === 0) {
      const empty = document.createElement("p");
      empty.className = "panel-card__text";
      empty.textContent = "該当する商品はありません。";
      body.appendChild(empty);
    }

    target.forEach((item) => {
      body.appendChild(
        createListCard({
          product: item,
          onEdit: () => {
            productService.setEditingProduct(item.id);
            navigate(ROUTES.REGISTER);
          },
          onDelete: () => {
            const ok = window.confirm(`${item.name} を削除しますか？`);
            if (!ok) {
              return;
            }

            productService.deleteProduct(item.id);
            renderList();
          }
        })
      );
    });

    listWrap.appendChild(createSectionCard({ title: "商品一覧", body }));
  };

  const renderTabs = () => {
    tabWrap.innerHTML = "";
    tabWrap.appendChild(
      createSectionCard({
        title: "分類タブ",
        body: createTabBar({
          tabs: LEDGER_TABS,
          activeTab,
          onTabChange: (tab) => {
            activeTab = tab;
            renderTabs();
            renderList();
          }
        })
      })
    );
  };

  renderTabs();
  searchWrap.appendChild(createSectionCard({ title: "検索", body: search }));
  renderList();

  if (flashMessage) {
    const notice = document.createElement("div");
    notice.className = "notice is-success";
    notice.textContent = flashMessage;
    page.appendChild(notice);
  }

  page.append(tabWrap, searchWrap, listWrap);
  return page;
};
