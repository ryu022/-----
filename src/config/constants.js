import { PRODUCT_CATEGORIES } from "./productMasterConstants.js";

export const ROUTES = {
  HOME: "home",
  LEDGER: "ledger",
  REGISTER: "register",
  ALLOCATION: "allocation",
  INVENTORY: "inventory",
  HISTORY: "history",
  SUMMARY: "summary",
  PRINT: "print"
};

export const ROUTE_TITLES = {
  [ROUTES.HOME]: "ホーム",
  [ROUTES.LEDGER]: "商品台帳",
  [ROUTES.REGISTER]: "商品登録",
  [ROUTES.ALLOCATION]: "商品振り分け",
  [ROUTES.INVENTORY]: "棚卸実施",
  [ROUTES.HISTORY]: "過去の棚卸",
  [ROUTES.SUMMARY]: "集計",
  [ROUTES.PRINT]: "印刷"
};

export const HOME_CARDS = [
  { label: "商品台帳", route: ROUTES.LEDGER },
  { label: "商品登録", route: ROUTES.REGISTER },
  { label: "商品振り分け", route: ROUTES.ALLOCATION },
  { label: "棚卸実施", route: ROUTES.INVENTORY },
  { label: "過去の棚卸", route: ROUTES.HISTORY },
  { label: "集計", route: ROUTES.SUMMARY },
  { label: "印刷", route: ROUTES.PRINT }
];

export const LEDGER_TABS = PRODUCT_CATEGORIES;
export const INVENTORY_TABS = ["売場", "バックヤード", "資材"];

export const ALLOCATION_AREAS = ["売場", "バックヤード", "資材"];

export const DUMMY_PRODUCTS = [
  { id: "P001", name: "真あじ", standard: "1尾", category: "鮮魚", cost: 280, supplier: "海鮮商事" },
  { id: "P002", name: "塩さば", standard: "半身", category: "塩干", cost: 198, supplier: "北浜水産" },
  { id: "P003", name: "まぐろ切り落とし", standard: "100g", category: "鮮魚", cost: 320, supplier: "築地フーズ" },
  { id: "P004", name: "ラップ", standard: "30cm", category: "資材", cost: 120, supplier: "店舗資材センター" },
  { id: "P005", name: "しらす干し", standard: "80g", category: "塩干", cost: 240, supplier: "浜名食品" }
];
