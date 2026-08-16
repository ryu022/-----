import { runtimeConfig } from "../config/runtimeConfig.js";

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};

export class GasApiClient {
  constructor() {
    this.cache = new Map();
    this.endpoint = runtimeConfig.gasEndpoint;
    this.enabled = runtimeConfig.useGas && Boolean(this.endpoint);
  }

  isEnabled() {
    return this.enabled;
  }

  setEndpoint(endpoint) {
    this.endpoint = endpoint;
    this.enabled = Boolean(endpoint);
  }

  async request({ entity, action, payload = {}, cacheable = false }) {
    if (!this.enabled) {
      throw new Error("GAS endpoint is not configured.");
    }

    const cacheKey = `${entity}:${action}:${stableStringify(payload)}`;
    const now = Date.now();

    if (cacheable && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (now - cached.timestamp <= runtimeConfig.listCacheTtlMs) {
        return structuredClone(cached.data);
      }
    }

    const isMutation = action !== "list";
    if (isMutation) {
      this.clearCache();
    }

    const result = await this.requestWithRetry({ entity, action, payload });

    if (cacheable) {
      this.cache.set(cacheKey, {
        timestamp: now,
        data: structuredClone(result)
      });
    }

    return result;
  }

  clearCache() {
    this.cache.clear();
  }

  async requestWithRetry({ entity, action, payload }) {
    const attempts = Math.max(runtimeConfig.retryCount + 1, 1);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.requestOnce({ entity, action, payload });
      } catch (error) {
        if (attempt === attempts) {
          throw error;
        }

        await sleep(240 * attempt);
      }
    }

    throw new Error("Unexpected retry loop termination");
  }

  async requestOnce({ entity, action, payload }) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), runtimeConfig.requestTimeoutMs);

    try {
      window.dispatchEvent(new CustomEvent("repo:network", { detail: { status: "loading", entity, action } }));

      let response;
      try {
        response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": runtimeConfig.requestContentType,
            Accept: "application/json"
          },
          body: JSON.stringify({ entity, action, payload }),
          signal: controller.signal,
          mode: "cors"
        });
      } catch (fetchError) {
        console.error("[GAS FETCH ERROR]", {
          entity,
          action,
          errorName: fetchError?.name ?? "",
          errorMessage: fetchError?.message ?? String(fetchError ?? ""),
          errorStack: fetchError?.stack ?? ""
        });
        throw fetchError;
      }

      const httpStatus = response.status;
      const statusText = response.statusText || "";
      const responseOk = response.ok;
      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text();

      console.error("[GAS RAW RESPONSE]", {
        entity,
        action,
        status: httpStatus,
        ok: responseOk,
        statusText,
        contentType,
        rawText
      });

      let json = null;
      let parseError = null;
      if (rawText) {
        try {
          json = JSON.parse(rawText);
        } catch (error) {
          parseError = error;
        }
      }

      if (parseError) {
        console.error("[GAS PARSE ERROR]", {
          entity,
          action,
          status: httpStatus,
          ok: responseOk,
          contentType,
          parseErrorMessage: parseError?.message ?? String(parseError ?? ""),
          parseErrorStack: parseError?.stack ?? "",
          rawText
        });

        const parseFailureMessage = responseOk
          ? rawText || parseError?.message || "GAS request failed"
          : `HTTP ${httpStatus} ${statusText}`.trim();
        throw new Error(parseFailureMessage);
      }

      const gasErrorCode = json?.error?.code ?? "";
      const gasErrorMessage = json?.error?.message ?? "";
      const gasErrorStack = json?.error?.stack ?? "";

      if (!responseOk || !json?.success) {
        const fallbackMessage = responseOk
          ? "Googleスプレッドシートとの通信に失敗しました。"
          : `HTTP ${httpStatus} ${statusText}`.trim();
        const message = gasErrorMessage || json?.message || fallbackMessage || "Googleスプレッドシートとの通信に失敗しました。";

        console.error("[GAS ERROR]", {
          entity,
          action,
          errorCode: gasErrorCode,
          errorMessage: gasErrorMessage,
          errorStack: gasErrorStack,
          httpStatus
        });

        console.error("GAS request failed", {
          entity,
          action,
          httpStatus,
          gasErrorCode,
          gasErrorMessage,
          gasErrorStack,
          payload
        });

        const requestError = new Error(message);
        requestError.gasErrorCode = gasErrorCode;
        requestError.gasErrorMessage = gasErrorMessage;
        requestError.gasErrorStack = gasErrorStack;
        requestError.httpStatus = httpStatus;
        requestError.entity = entity;
        requestError.action = action;
        throw requestError;
      }

      window.dispatchEvent(new CustomEvent("repo:network", { detail: { status: "success", entity, action } }));
      return json.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "通信に失敗しました。もう一度お試しください。";
      console.error("GAS request failed", { entity, action, message, error });
      window.dispatchEvent(
        new CustomEvent("repo:network", {
          detail: {
            status: "error",
            entity,
            action,
            message
          }
        })
      );
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

export const gasApiClient = new GasApiClient();
