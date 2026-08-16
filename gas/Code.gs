const SHEETS = {
  PRODUCTS: "商品マスター",
  ASSIGNMENTS: "商品振り分け",
  INVENTORY_SESSIONS: "棚卸セッション",
  INVENTORY: "棚卸データ"
};

const HEADERS = {
  [SHEETS.PRODUCTS]: ["productId", "name", "standard", "category", "cost", "supplier", "storeId", "updatedAt"],
  [SHEETS.ASSIGNMENTS]: [
    "assignmentId",
    "productId",
    "storeId",
    "isTarget",
    "salesFloor",
    "backyard",
    "materials",
    "salesFloorOrder",
    "backyardOrder",
    "materialsOrder",
    "createdAt",
    "updatedAt"
  ],
  [SHEETS.INVENTORY_SESSIONS]: [
    "sessionId",
    "storeId",
    "storeName",
    "inventoryDate",
    "status",
    "createdAt",
    "completedAt",
    "completedBy",
    "updatedAt",
    "updatedBy"
  ],
  [SHEETS.INVENTORY]: [
    "recordId",
    "storeId",
    "sessionId",
    "storeName",
    "inventoryDate",
    "productId",
    "location",
    "quantity",
    "updatedAt",
    "updatedBy"
  ]
};

function doGet(e) {
  return handleRequest_(e, true);
}

function doPost(e) {
  return handleRequest_(e, false);
}

function doOptions(e) {
  return jsonResponse_({ success: true });
}

function handleRequest_(e, isGet) {
  try {
    const payload = parsePayload_(e, isGet);
    const entity = payload.entity;
    const action = payload.action;
    const data = payload.payload || {};
    const storeId = normalizeStoreId_(payload.storeId || data.storeId || (e && e.parameter ? e.parameter.storeId : ""));

    ensureSheets_();

    const result = executeAction_(entity, action, data, storeId);
    return jsonResponse_({ success: true, data: result });
  } catch (error) {
    const message = String((error && error.message) ? error.message : error || "");
    const stack = String((error && error.stack) ? error.stack : "");
    const payload = parsePayload_(e, isGet);
    const data = payload.payload || {};
    const effectiveStoreId = normalizeStoreId_(payload.storeId || data.storeId || (e && e.parameter ? e.parameter.storeId : ""));
    const sessionId = String(data.sessionId || data.item?.sessionId || "");
    const details = {
      entity: payload.entity || "",
      action: payload.action || "",
      storeId: effectiveStoreId,
      sessionId,
      message,
      stack
    };

    console.error("[REQUEST_ERROR]", details);
    Logger.log("[REQUEST_ERROR] " + JSON.stringify(details));

    const errorCode = String((error && error.code) ? error.code : "GAS_ERROR");

    return jsonResponse_({
      success: false,
      error: {
        code: errorCode,
        message: message,
        stack: stack
      }
    });
  }
}

function classifyErrorCode_(message) {
  const text = String(message || "");

  if (text.indexOf("Unsupported") >= 0) {
    return "UNSUPPORTED_OPERATION";
  }

  if (text.indexOf("storeId is required") >= 0) {
    return "STORE_ID_REQUIRED";
  }

  if (text.indexOf("sessionId is required") >= 0) {
    return "SESSION_ID_REQUIRED";
  }

  if (text.indexOf("Sheet not found") >= 0) {
    return "SHEET_NOT_FOUND";
  }

  return "GAS_ERROR";
}

function parsePayload_(e, isGet) {
  if (isGet) {
    const params = (e && e.parameter) ? e.parameter : {};
    return {
      entity: params.entity || params.e || "",
      action: params.action || "",
      storeId: params.storeId || "",
      payload: {}
    };
  }

  const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
  let parsed = {};

  try {
    parsed = JSON.parse(raw || "{}")
  } catch (error) {
    parsed = {};
  }

  return {
    entity: parsed.entity || "",
    action: parsed.action || "",
    storeId: parsed.storeId || "",
    payload: parsed.payload || {}
  };
}

function executeAction_(entity, action, data, storeId) {
  const normalizedAction = String(action || "").trim();
  const normalizedEntity = String(entity || "").trim();

  if (normalizedEntity === "products") {
    return handleProducts_(normalizedAction, data, storeId);
  }

  if (normalizedEntity === "assignments") {
    return handleAssignments_(normalizedAction, data, storeId);
  }

  if (normalizedEntity === "inventorySessions") {
    return handleInventorySessions_(normalizedAction, data, storeId);
  }

  if (normalizedEntity === "inventoryRecords") {
    return handleInventoryRecords_(normalizedAction, data, storeId);
  }

  if (normalizedEntity === "inventory") {
    return handleInventory_(normalizedAction, data, storeId);
  }

  throw new Error("Unsupported entity: " + entity);
}

function handleProducts_(action, payload, storeId) {
  const sheet = getSheet_(SHEETS.PRODUCTS);
  const targetStoreId = normalizeStoreId_(storeId || (payload && payload.storeId) || "");

  if (action === "list" || action === "getProducts") {
    return filterRowsByStoreId_(readRows_(sheet), targetStoreId).map(function (row) {
      return toProductResponse_(row);
    });
  }

  if (action === "upsert" || action === "saveProduct" || action === "updateProduct") {
    const item = sanitizeProduct_(payload.item || payload, targetStoreId);
    upsertByKey_(sheet, "productId", item, targetStoreId);
    clearCache_("products:list:{}");
    return toProductResponse_(item);
  }

  if (action === "bulkUpsert") {
    const items = (payload.items || []).map(function (item) {
      return sanitizeProduct_(item, targetStoreId);
    });
    bulkUpsertByKey_(sheet, "productId", items, targetStoreId);
    clearCache_("products:list:{}");
    return { count: items.length };
  }

  if (action === "delete" || action === "deleteProduct") {
    deleteByKey_(sheet, "productId", String(payload.id || payload.productId || ""), targetStoreId);
    clearCache_("products:list:{}");
    return { deleted: true };
  }

  throw new Error("Unsupported products action: " + action);
}

function handleAssignments_(action, payload, storeId) {
  const sheet = getSheet_(SHEETS.ASSIGNMENTS);
  const targetStoreId = normalizeStoreId_(storeId || (payload && payload.storeId) || "");

  if (action === "list" || action === "getAssignments") {
    return filterRowsByStoreId_(readRows_(sheet), targetStoreId).map(function (row) {
      return toAssignmentResponse_(row);
    });
  }

  if (action === "upsert" || action === "saveAssignment") {
    const item = sanitizeAssignment_(payload.item || payload, targetStoreId);
    upsertByKey_(sheet, "productId", item, targetStoreId);
    clearCache_("assignments:list:{}");
    return toAssignmentResponse_(item);
  }

  if (action === "bulkUpsert") {
    const items = (payload.items || []).map(function (item) {
      return sanitizeAssignment_(item, targetStoreId);
    });
    bulkUpsertByKey_(sheet, "productId", items, targetStoreId);
    clearCache_("assignments:list:{}");
    return { count: items.length };
  }

  throw new Error("Unsupported assignments action: " + action);
}

function handleInventorySessions_(action, payload, storeId) {
  const traceBase = {
    entity: "inventorySessions",
    action,
    rawStoreId: extractStoreIdFromPayload_(payload, storeId),
    payloadStoreId: payload && payload.storeId ? String(payload.storeId) : "",
    sessionId: String(payload?.sessionId || payload?.item?.sessionId || "")
  };

  console.info("[INVENTORY_SESSIONS] start", traceBase);

  const completeTrace = function (step, extra) {
    const detail = Object.assign({}, traceBase, { step: step }, extra || {});
    console.info("[COMPLETE]", detail);
    Logger.log("[COMPLETE] " + JSON.stringify(detail));
  };

  const sessionSheet = getSheet_(SHEETS.INVENTORY_SESSIONS);
  const recordSheet = getSheet_(SHEETS.INVENTORY);

  const rawStoreId = extractStoreIdFromPayload_(payload, storeId);
  const targetStoreId = normalizeStoreId_(storeId || (payload && payload.storeId) || "");

  if (action === "list") {
    const sessionRows = filterRowsByStoreId_(readRows_(sessionSheet), targetStoreId);
    const legacyRows = filterRowsByStoreId_(readRows_(recordSheet), targetStoreId).filter(function (row) {
      return row.location === "__SESSION__";
    });
    return mergeSessions_(sessionRows, legacyRows);
  }

  if (action === "upsert" || action === "complete") {
    try {
      if (action === "complete") {
        const sessionHeader = HEADERS[sessionSheet.getName()];
        const recordHeader = HEADERS[recordSheet.getName()];
        const sessionExistingHeader = sessionHeader
          ? sessionSheet.getRange(1, 1, 1, sessionHeader.length).getValues()[0]
          : [];
        const recordExistingHeader = recordHeader
          ? recordSheet.getRange(1, 1, 1, recordHeader.length).getValues()[0]
          : [];
        const isSessionHeaderValid = Boolean(sessionHeader) && sessionHeader.every(function (col, index) {
          return sessionExistingHeader[index] === col;
        });
        const isRecordHeaderValid = Boolean(recordHeader) && recordHeader.every(function (col, index) {
          return recordExistingHeader[index] === col;
        });

        completeTrace("start", { rawStoreId: rawStoreId, targetStoreId: targetStoreId });
        completeTrace("sessionSheet", {
          sheetName: sessionSheet.getName(),
          headerDefined: Boolean(sessionHeader),
          headerValid: isSessionHeaderValid,
          expectedHeader: sessionHeader || [],
          existingHeader: sessionExistingHeader
        });
        completeTrace("recordSheet", {
          sheetName: recordSheet.getName(),
          headerDefined: Boolean(recordHeader),
          headerValid: isRecordHeaderValid,
          expectedHeader: recordHeader || [],
          existingHeader: recordExistingHeader
        });

        requireStoreId_(rawStoreId, "inventorySessions", action);
        completeTrace("storeId validated", { rawStoreId: rawStoreId, targetStoreId: targetStoreId });
      }

      const item = sanitizeSession_(payload.item || payload, targetStoreId);

      if (action === "complete" && !item.sessionId) {
        throw new Error("sessionId is required for inventorySessions complete");
      }

      if (action === "complete") {
        completeTrace("sessionId validated", { sessionId: item.sessionId });
        item.status = "completed";
        item.completedAt = item.completedAt || new Date().toISOString();
      }

      item.updatedAt = new Date().toISOString();
      if (action === "complete") {
        completeTrace("session update start", { keyName: "sessionId", keyValue: item.sessionId });
      }
      upsertByKey_(sessionSheet, "sessionId", item, targetStoreId, {
        flow: action === "complete" ? "COMPLETE:SESSION" : "UPSERT:SESSION",
        entity: "inventorySessions",
        action: action,
        keyName: "sessionId",
        keyValue: item.sessionId,
        targetStoreId: targetStoreId
      });
      if (action === "complete") {
        completeTrace("session update complete", { keyName: "sessionId", keyValue: item.sessionId });
      }

      const sessionRow = {
        recordId: "SESSION:" + item.sessionId,
        storeId: item.storeId,
        sessionId: item.sessionId,
        storeName: item.storeName,
        inventoryDate: item.inventoryDate,
        productId: "",
        location: "__SESSION__",
        quantity: "",
        updatedAt: new Date().toISOString(),
        updatedBy: item.updatedBy || ""
      };
      if (action === "complete") {
        completeTrace("legacy update start", { keyName: "recordId", keyValue: sessionRow.recordId });
      }
      upsertByKey_(recordSheet, "recordId", sessionRow, targetStoreId, {
        flow: action === "complete" ? "COMPLETE:LEGACY_SESSION_ROW" : "UPSERT:LEGACY_SESSION_ROW",
        entity: "inventorySessions",
        action: action,
        keyName: "recordId",
        keyValue: sessionRow.recordId,
        targetStoreId: targetStoreId
      });
      if (action === "complete") {
        completeTrace("legacy update complete", { keyName: "recordId", keyValue: sessionRow.recordId });
        completeTrace("finished", { sessionId: item.sessionId, storeId: targetStoreId });
      }

      clearCache_("inventorySessions:list:{}");
      clearCache_("inventoryRecords:list:{}");
      return toSessionResponse_(item);
    } catch (error) {
      if (action === "complete") {
        const message = String((error && error.message) ? error.message : error || "");
        const stack = String((error && error.stack) ? error.stack : "");
        const detail = {
          message: message,
          stack: stack,
          sessionId: String(payload && payload.item && payload.item.sessionId ? payload.item.sessionId : (payload && payload.sessionId ? payload.sessionId : "")),
          storeId: targetStoreId
        };

        console.error("[COMPLETE ERROR]", detail);
        Logger.log("[COMPLETE ERROR] " + JSON.stringify(detail));

        const completeError = new Error(message || "inventorySessions complete failed");
        completeError.code = "COMPLETE_ERROR";
        completeError.stack = stack || completeError.stack;
        throw completeError;
      }

      throw error;
    }
  }

  if (action === "delete") {
    requireStoreId_(rawStoreId, "inventorySessions", action);

    const sessionId = String(payload.sessionId || "");
    if (!sessionId) {
      throw new Error("sessionId is required for inventorySessions delete");
    }

    const result = deleteBySessionIds_([sessionId], targetStoreId);
    clearCache_("inventorySessions:list:{}");
    clearCache_("inventoryRecords:list:{}");
    return result;
  }

  if (action === "bulkDelete") {
    const bulkTrace = function (step, extra) {
      const detail = Object.assign({}, traceBase, { step: step }, extra || {});
      console.info("[BULK_DELETE]", detail);
      Logger.log("[BULK_DELETE] " + JSON.stringify(detail));
    };

    bulkTrace("start");
    requireStoreId_(rawStoreId, "inventorySessions", action);
    bulkTrace("storeId validated", { rawStoreId: rawStoreId, targetStoreId: targetStoreId });

    const sessionIds = (payload.sessionIds || []).map(function (id) {
      return String(id || "").trim();
    }).filter(function (id) {
      return Boolean(id);
    });

    bulkTrace("sessionIds parsed", { sessionIds: sessionIds, count: sessionIds.length });

    if (sessionIds.length === 0) {
      bulkTrace("sessionIds empty - no operation");
      return { deletedSessionCount: 0, deletedRecordCount: 0 };
    }

    bulkTrace("deleteBySessionIds start");
    const result = deleteBySessionIds_(sessionIds, targetStoreId);
    bulkTrace("deleteBySessionIds complete", result);
    clearCache_("inventorySessions:list:{}");
    clearCache_("inventoryRecords:list:{}");
    bulkTrace("finished", { storeId: targetStoreId });
    return result;
  }

  throw new Error("Unsupported inventorySessions action: " + action);
}

function handleInventoryRecords_(action, payload, storeId) {
  const sheet = getSheet_(SHEETS.INVENTORY);
  const rawStoreId = extractStoreIdFromPayload_(payload, storeId);
  const targetStoreId = normalizeStoreId_(storeId || (payload && payload.storeId) || "");

  if (action === "listBySession") {
    requireStoreId_(rawStoreId, "inventoryRecords", action);

    const sessionId = String(payload.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("sessionId is required for inventoryRecords listBySession");
    }

    return filterRowsByStoreId_(readRows_(sheet), targetStoreId)
      .filter(function (row) {
        return row.location !== "__SESSION__" && String(row.sessionId || "") === sessionId;
      })
      .map(function (row) {
        return toRecordResponse_(row);
      });
  }

  if (action === "list" || action === "getInventory") {
    return filterRowsByStoreId_(readRows_(sheet), targetStoreId).filter(function (row) {
      return row.location !== "__SESSION__";
    }).map(function (row) {
      return toRecordResponse_(row);
    });
  }

  if (action === "upsert" || action === "saveInventory") {
    const item = sanitizeRecord_(payload.item || payload, targetStoreId);
    upsertByKey_(sheet, "recordId", item, targetStoreId);
    clearCache_("inventoryRecords:list:{}");
    return toRecordResponse_(item);
  }

  if (action === "deleteBySession") {
    requireStoreId_(rawStoreId, "inventoryRecords", action);

    const sessionId = String(payload.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("sessionId is required for inventoryRecords deleteBySession");
    }

    const result = deleteRecordsBySessionId_(sessionId, targetStoreId);
    clearCache_("inventoryRecords:list:{}");
    return result;
  }

  throw new Error("Unsupported inventoryRecords action: " + action);
}

function extractStoreIdFromPayload_(payload, storeId) {
  if (storeId) {
    return String(storeId).trim();
  }

  if (!payload) {
    return "";
  }

  if (payload.storeId) {
    return String(payload.storeId).trim();
  }

  if (payload.item && payload.item.storeId) {
    return String(payload.item.storeId).trim();
  }

  return "";
}

function requireStoreId_(storeId, entity, action) {
  if (String(storeId || "").trim()) {
    return;
  }

  throw new Error("storeId is required for " + entity + " " + action);
}

function handleInventory_(action, payload, storeId) {
  const sessions = handleInventorySessions_("list", payload, storeId);
  const records = handleInventoryRecords_("list", payload, storeId);
  return { sessions: sessions, records: records };
}

function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SHEETS).forEach(function (key) {
    const name = SHEETS[key];
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }

    const header = HEADERS[name];
    const existing = sheet.getRange(1, 1, 1, header.length).getValues()[0];
    const valid = header.every(function (col, index) {
      return existing[index] === col;
    });

    console.info("[SHEET_HEADER_CHECK]", {
      sheetName: name,
      expectedHeader: header,
      existingHeader: existing,
      valid: valid
    });
    Logger.log("[SHEET_HEADER_CHECK] " + JSON.stringify({ sheetName: name, valid: valid }));

    if (!valid) {
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
      sheet.setFrozenRows(1);
    }
  });
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error("Sheet not found: " + name);
  }
  return sheet;
}

function readRows_(sheet) {
  const cacheKey = sheet.getName() + ":rows";
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const lastRow = sheet.getLastRow();
  const header = HEADERS[sheet.getName()];
  if (lastRow <= 1) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  const rows = values.map(function (line, index) {
    const row = { __rowNumber: index + 2 };
    header.forEach(function (key, headerIndex) {
      row[key] = line[headerIndex];
    });
    return row;
  });

  cache.put(cacheKey, JSON.stringify(rows), 15);
  return rows;
}

function upsertByKey_(sheet, keyName, item, storeId, traceContext) {
  const context = traceContext || {};
  const sheetName = sheet.getName();

  console.info("[UPSERT] start", {
    flow: context.flow || "",
    sheetName: sheetName,
    keyName: keyName,
    keyValue: String(item && item[keyName] ? item[keyName] : ""),
    storeId: storeId || ""
  });

  const lock = LockService.getDocumentLock();
  console.info("[UPSERT] lock wait start", { flow: context.flow || "", sheetName: sheetName });
  lock.waitLock(10000);
  console.info("[UPSERT] lock acquired", { flow: context.flow || "", sheetName: sheetName });

  try {
    const header = HEADERS[sheetName];
    if (!header) {
      console.error("[UPSERT] header undefined", {
        flow: context.flow || "",
        sheetName: sheetName,
        knownHeaders: Object.keys(HEADERS)
      });
      throw new Error("HEADERS is undefined for sheet: " + sheetName);
    }

    const storeFilter = normalizeStoreId_(storeId || item.storeId || "");
    const data = readRows_(sheet).filter(function (row) {
      return !storeFilter || String(row.storeId || "") === storeFilter;
    });
    const rowIndex = data.findIndex(function (row) {
      return String(row[keyName] || "") === String(item[keyName] || "");
    });

    const rowValues = header.map(function (key) {
      return item[key] !== undefined ? item[key] : "";
    });

    if (rowIndex < 0) {
      console.info("[UPSERT] appendRow", {
        flow: context.flow || "",
        sheetName: sheetName,
        keyName: keyName,
        keyValue: String(item && item[keyName] ? item[keyName] : "")
      });
      sheet.appendRow(rowValues);
      return;
    }

    const targetRow = data[rowIndex];
    console.info("[UPSERT] setValues", {
      flow: context.flow || "",
      sheetName: sheetName,
      rowNumber: targetRow.__rowNumber,
      keyName: keyName,
      keyValue: String(item && item[keyName] ? item[keyName] : "")
    });
    sheet.getRange(targetRow.__rowNumber, 1, 1, header.length).setValues([rowValues]);
  } finally {
    console.info("[UPSERT] lock release", { flow: context.flow || "", sheetName: sheetName });
    lock.releaseLock();
  }
}

function bulkUpsertByKey_(sheet, keyName, items, storeId) {
  if (!items || items.length === 0) {
    return;
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const header = HEADERS[sheet.getName()];
    const storeFilter = normalizeStoreId_(storeId || "");
    const current = readRows_(sheet).filter(function (row) {
      return !storeFilter || String(row.storeId || "") === storeFilter;
    });
    const indexByKey = {};
    current.forEach(function (row) {
      indexByKey[String(row[keyName] || "")] = row.__rowNumber;
    });

    items.forEach(function (item) {
      const key = String(item[keyName] || "");
      const rowValues = header.map(function (col) {
        return item[col] !== undefined ? item[col] : "";
      });
      if (!indexByKey[key]) {
        sheet.appendRow(rowValues);
      } else {
        sheet.getRange(indexByKey[key], 1, 1, header.length).setValues([rowValues]);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function deleteByKey_(sheet, keyName, keyValue, storeId) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const storeFilter = normalizeStoreId_(storeId || "");
    const rows = readRows_(sheet).filter(function (row) {
      return !storeFilter || String(row.storeId || "") === storeFilter;
    });
    const hit = rows.findIndex(function (row) {
      return String(row[keyName] || "") === String(keyValue || "");
    });
    if (hit < 0) {
      return;
    }
    sheet.deleteRow(rows[hit].__rowNumber);
  } finally {
    lock.releaseLock();
  }
}

function mergeSessions_(sessionRows, legacyRows) {
  const map = {};

  (legacyRows || []).forEach(function (row) {
    if (!row.sessionId) {
      return;
    }

    map[row.sessionId] = {
      sessionId: row.sessionId,
      storeId: row.storeId,
      storeName: row.storeName,
      inventoryDate: row.inventoryDate,
      status: "draft",
      createdAt: row.updatedAt || new Date().toISOString(),
      completedAt: "",
      completedBy: "",
      updatedAt: row.updatedAt || new Date().toISOString(),
      updatedBy: row.updatedBy || ""
    };
  });

  (sessionRows || []).forEach(function (row) {
    if (!row.sessionId) {
      return;
    }

    map[row.sessionId] = toSessionResponse_(row);
  });

  return Object.keys(map).map(function (key) {
    return map[key];
  });
}

function deleteBySessionIds_(sessionIds, storeId) {
  const ids = (sessionIds || []).map(function (id) {
    return String(id || "").trim();
  }).filter(function (id) {
    return Boolean(id);
  });

  console.info("[DELETE_BY_SESSION_IDS] parsed", {
    storeId: storeId,
    sessionIds: ids,
    count: ids.length
  });

  if (ids.length === 0) {
    return { deletedSessionCount: 0, deletedRecordCount: 0 };
  }

  const deletedSessions = deleteRowsByMatcher_(getSheet_(SHEETS.INVENTORY_SESSIONS), function (row) {
    return ids.indexOf(String(row.sessionId || "")) >= 0;
  }, storeId);

  const deletedRecords = deleteRowsByMatcher_(getSheet_(SHEETS.INVENTORY), function (row) {
    return ids.indexOf(String(row.sessionId || "")) >= 0;
  }, storeId);

  return {
    deletedSessionCount: deletedSessions,
    deletedRecordCount: deletedRecords
  };
}

function deleteRecordsBySessionId_(sessionId, storeId) {
  const deletedRecords = deleteRowsByMatcher_(getSheet_(SHEETS.INVENTORY), function (row) {
    return String(row.sessionId || "") === String(sessionId || "");
  }, storeId);

  return { deletedRecordCount: deletedRecords };
}

function deleteRowsByMatcher_(sheet, matcher, storeId) {
  const sheetName = sheet.getName();

  console.info("[DELETE_ROWS] start", {
    sheetName: sheetName,
    storeId: storeId
  });

  const lock = LockService.getDocumentLock();
  console.info("[DELETE_ROWS] lock wait start", { sheetName: sheetName });
  lock.waitLock(10000);
  console.info("[DELETE_ROWS] lock acquired", { sheetName: sheetName });

  try {
    const storeFilter = normalizeStoreId_(storeId || "");
    const rows = readRows_(sheet).filter(function (row) {
      return !storeFilter || String(row.storeId || "") === storeFilter;
    });

    const rowNumbers = rows
      .filter(function (row) {
        return matcher(row);
      })
      .map(function (row) {
        return row.__rowNumber;
      })
      .sort(function (a, b) {
        return b - a;
      });

    rowNumbers.forEach(function (rowNumber) {
      sheet.deleteRow(rowNumber);
    });

    console.info("[DELETE_ROWS] complete", {
      sheetName: sheetName,
      deletedCount: rowNumbers.length
    });

    return rowNumbers.length;
  } finally {
    console.info("[DELETE_ROWS] lock release", { sheetName: sheetName });
    lock.releaseLock();
  }
}

function clearCache_(key) {
  const cache = CacheService.getScriptCache();
  cache.remove(key);
  cache.remove(SHEETS.PRODUCTS + ":rows");
  cache.remove(SHEETS.ASSIGNMENTS + ":rows");
  cache.remove(SHEETS.INVENTORY_SESSIONS + ":rows");
  cache.remove(SHEETS.INVENTORY + ":rows");
}

function normalizeStoreId_(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "default";
}

function sanitizeText_(value) {
  return String(value || "").replace(/[<>]/g, "").trim();
}

function sanitizeNumber_(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function sanitizeProduct_(item, storeId) {
  const productId = sanitizeText_(item.productId || item.id);
  return {
    productId: productId,
    name: sanitizeText_(item.name),
    standard: sanitizeText_(item.standard),
    category: sanitizeText_(item.category),
    cost: sanitizeNumber_(item.cost),
    supplier: sanitizeText_(item.supplier),
    storeId: normalizeStoreId_(storeId || item.storeId || ""),
    updatedAt: new Date().toISOString()
  };
}

function sanitizeAssignment_(item, storeId) {
  return {
    assignmentId: sanitizeText_(item.assignmentId),
    productId: sanitizeText_(item.productId),
    storeId: normalizeStoreId_(storeId || item.storeId || ""),
    isTarget: Boolean(item.isTarget),
    salesFloor: Boolean(item.salesFloor),
    backyard: Boolean(item.backyard),
    materials: Boolean(item.materials),
    salesFloorOrder: item.salesFloorOrder === null || item.salesFloorOrder === "" ? "" : sanitizeNumber_(item.salesFloorOrder),
    backyardOrder: item.backyardOrder === null || item.backyardOrder === "" ? "" : sanitizeNumber_(item.backyardOrder),
    materialsOrder: item.materialsOrder === null || item.materialsOrder === "" ? "" : sanitizeNumber_(item.materialsOrder),
    createdAt: sanitizeText_(item.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function sanitizeSession_(item, storeId) {
  const now = new Date().toISOString();
  return {
    sessionId: sanitizeText_(item.sessionId),
    storeId: normalizeStoreId_(storeId || item.storeId || ""),
    storeName: sanitizeText_(item.storeName),
    inventoryDate: sanitizeText_(item.inventoryDate),
    status: sanitizeText_(item.status) || "draft",
    createdAt: sanitizeText_(item.createdAt) || now,
    completedAt: sanitizeText_(item.completedAt),
    completedBy: sanitizeText_(item.completedBy),
    updatedAt: sanitizeText_(item.updatedAt) || now,
    updatedBy: sanitizeText_(item.updatedBy)
  };
}

function sanitizeRecord_(item, storeId) {
  return {
    recordId: sanitizeText_(item.recordId),
    storeId: normalizeStoreId_(storeId || item.storeId || ""),
    sessionId: sanitizeText_(item.sessionId),
    inventoryDate: sanitizeText_(item.inventoryDate),
    productId: sanitizeText_(item.productId),
    location: sanitizeText_(item.location),
    quantity: sanitizeNumber_(item.quantity),
    updatedAt: new Date().toISOString(),
    updatedBy: sanitizeText_(item.updatedBy)
  };
}

function toProductResponse_(row) {
  return {
    id: row.productId || row.id || "",
    productId: row.productId || row.id || "",
    name: row.name || "",
    standard: row.standard || "",
    category: row.category || "",
    cost: row.cost || 0,
    supplier: row.supplier || "",
    storeId: row.storeId || "",
    updatedAt: row.updatedAt || ""
  };
}

function toAssignmentResponse_(row) {
  return {
    assignmentId: row.assignmentId || "",
    productId: row.productId || "",
    storeId: row.storeId || "",
    isTarget: row.isTarget === true || row.isTarget === "TRUE" || row.isTarget === "true",
    salesFloor: row.salesFloor === true || row.salesFloor === "TRUE" || row.salesFloor === "true",
    backyard: row.backyard === true || row.backyard === "TRUE" || row.backyard === "true",
    materials: row.materials === true || row.materials === "TRUE" || row.materials === "true",
    salesFloorOrder: row.salesFloorOrder || null,
    backyardOrder: row.backyardOrder || null,
    materialsOrder: row.materialsOrder || null,
    createdAt: row.createdAt || "",
    updatedAt: row.updatedAt || ""
  };
}

function toSessionResponse_(row) {
  return {
    sessionId: row.sessionId || "",
    storeId: row.storeId || "",
    storeName: row.storeName || "",
    inventoryDate: row.inventoryDate || "",
    status: row.status || "draft",
    createdAt: row.createdAt || "",
    completedAt: row.completedAt || "",
    completedBy: row.completedBy || "",
    updatedAt: row.updatedAt || "",
    updatedBy: row.updatedBy || ""
  };
}

function toRecordResponse_(row) {
  return {
    recordId: row.recordId || "",
    storeId: row.storeId || "",
    sessionId: row.sessionId || "",
    inventoryDate: row.inventoryDate || "",
    productId: row.productId || "",
    location: row.location || "",
    quantity: row.quantity || 0,
    updatedAt: row.updatedAt || "",
    updatedBy: row.updatedBy || ""
  };
}

function filterRowsByStoreId_(rows, targetStoreId) {
  if (!targetStoreId) {
    return rows;
  }

  return rows.filter(function (row) {
    return String(row.storeId || "") === String(targetStoreId);
  });
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
