const SHEETS = {
  PRODUCTS: "商品マスター",
  ASSIGNMENTS: "商品振り分け",
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
    const message = error && error.message ? error.message : "サーバーエラーが発生しました。";
    console.error("GAS request failed", message, error);
    return jsonResponse_({
      success: false,
      error: {
        code: "GAS_ERROR",
        message: "通信に失敗しました。もう一度お試しください。"
      }
    });
  }
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
  const sheet = getSheet_(SHEETS.INVENTORY);
  const targetStoreId = normalizeStoreId_(storeId || (payload && payload.storeId) || "");

  if (action === "list") {
    const all = filterRowsByStoreId_(readRows_(sheet), targetStoreId);
    return uniqueSessions_(all);
  }

  if (action === "upsert") {
    const item = sanitizeSession_(payload.item || payload, targetStoreId);
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
    upsertByKey_(sheet, "recordId", sessionRow, targetStoreId);
    clearCache_("inventorySessions:list:{}");
    clearCache_("inventoryRecords:list:{}");
    return toSessionResponse_(item);
  }

  throw new Error("Unsupported inventorySessions action: " + action);
}

function handleInventoryRecords_(action, payload, storeId) {
  const sheet = getSheet_(SHEETS.INVENTORY);
  const targetStoreId = normalizeStoreId_(storeId || (payload && payload.storeId) || "");

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

  throw new Error("Unsupported inventoryRecords action: " + action);
}

function handleInventory_(action, payload, storeId) {
  const sessions = handleInventorySessions_(action, payload, storeId);
  const records = handleInventoryRecords_(action, payload, storeId);
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

function upsertByKey_(sheet, keyName, item, storeId) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const header = HEADERS[sheet.getName()];
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
      sheet.appendRow(rowValues);
      return;
    }

    const targetRow = data[rowIndex];
    sheet.getRange(targetRow.__rowNumber, 1, 1, header.length).setValues([rowValues]);
  } finally {
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

function uniqueSessions_(rows) {
  const map = {};
  rows.forEach(function (row) {
    if (!row.sessionId) {
      return;
    }

    if (row.location === "__SESSION__") {
      map[row.sessionId] = {
        sessionId: row.sessionId,
        storeId: row.storeId,
        storeName: row.storeName,
        inventoryDate: row.inventoryDate,
        createdAt: row.createdAt || new Date().toISOString()
      };
    }
  });

  return Object.keys(map).map(function (key) {
    return map[key];
  });
}

function clearCache_(key) {
  const cache = CacheService.getScriptCache();
  cache.remove(key);
  cache.remove(SHEETS.PRODUCTS + ":rows");
  cache.remove(SHEETS.ASSIGNMENTS + ":rows");
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
  return {
    sessionId: sanitizeText_(item.sessionId),
    storeId: normalizeStoreId_(storeId || item.storeId || ""),
    storeName: sanitizeText_(item.storeName),
    inventoryDate: sanitizeText_(item.inventoryDate),
    createdAt: sanitizeText_(item.createdAt) || new Date().toISOString(),
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
    createdAt: row.createdAt || "",
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
