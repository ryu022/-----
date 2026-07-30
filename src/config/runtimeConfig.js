export const runtimeConfig = {
  useGas: window.localStorage.getItem("inventory-app-use-gas") === "1",
  gasEndpoint: window.localStorage.getItem("inventory-app-gas-endpoint") ?? "",
  requestTimeoutMs: 8000,
  retryCount: 2,
  listCacheTtlMs: 15000
};
