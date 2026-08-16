const STORAGE_KEYS = {
  useGas: "inventory-app-use-gas",
  gasEndpoint: "inventory-app-gas-endpoint",
  storeId: "inventory-app-store-id",
  storeName: "inventory-app-store-name"
};

const normalizeStoreId = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "default";

const getStoredValue = (key, fallback = "") => {
  if (typeof window === "undefined" || !window.localStorage) {
    return fallback;
  }

  return window.localStorage.getItem(key) ?? fallback;
};

const DEFAULT_GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbyFxC3mX-7d1RSBy7vT5thscdoGI2kyiZMZhOjYlR7FTWmY1s2c3OVxG7r_ZrWIb792/exec";

const getUseGasValue = () => {
  const storedValue = getStoredValue(STORAGE_KEYS.useGas);

  if (storedValue === "0" || storedValue === "false") {
    return false;
  }

  if (storedValue === "1" || storedValue === "true") {
    return true;
  }

  return true;
};

export const runtimeConfig = {
  useGas: getUseGasValue(),
  gasEndpoint: getStoredValue(STORAGE_KEYS.gasEndpoint) || DEFAULT_GAS_ENDPOINT,
  requestTimeoutMs: 8000,
  retryCount: 2,
  listCacheTtlMs: 15000,
  requestContentType: "text/plain;charset=UTF-8",
  storeId: normalizeStoreId(getStoredValue(STORAGE_KEYS.storeId) || getStoredValue(STORAGE_KEYS.storeName) || "default")
};

export const setRuntimeStoreContext = ({ storeId, storeName }) => {
  const nextStoreId = normalizeStoreId(storeId || storeName || runtimeConfig.storeId || "default");

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEYS.storeId, nextStoreId);
    if (storeName) {
      window.localStorage.setItem(STORAGE_KEYS.storeName, storeName.trim());
    }
  }

  runtimeConfig.storeId = nextStoreId;
  return nextStoreId;
};

export const getRuntimeStoreId = () => runtimeConfig.storeId;
