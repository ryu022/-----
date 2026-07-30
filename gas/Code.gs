const SHEETS = {
  PRODUCTS: "商品マスター",
  ASSIGNMENTS: "商品振り分け",
  INVENTORY: "棚卸データ"
};

const HEADERS = {
  [SHEETS.PRODUCTS]: ["id", "name", "standard", "category", "cost", "supplier", "updatedAt"],
  [SHEETS.ASSIGNMENTS]: [
    "assignmentId",
    "productId",
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
    "sessionId",
    "storeName",
    "inventoryDate",
    "productId",
    "location",
    "quantity",
    "createdAt",
    "updatedAt"
  ]
};

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const entity = payload.entity;
    const action = payload.action;
    const data = payload.payload || {};

    ensureSheets_();

    const handlers = {
      products: () => handleProducts_(action, data),
      assignments: () => handleAssignments_(action, data),
      inventorySessions: () => handleInventorySessions_(action, data),
      inventoryRecords: () => handleInventoryRecords_(action, data)
    };

    if (!handlers[entity]) {
      throw new Error("Unsupported entity: " + entity);
    }

    const result = handlers[entity]();
    return jsonResponse_({ success: true, data: result });
  } catch (error) {
    return jsonResponse_({
      success: false,
      message: error && error.message ? error.message : "Server error"
    });
  }
}

function handleProducts_(action, payload) {
  const sheet = getSheet_(SHEETS.PRODUCTS);

  if (action === "list") {
    return readRows_(sheet);
  }

  if (action === "upsert") {
    const item = sanitizeProduct_(payload.item);
    upsertByKey_(sheet, "id", item);
    clearCache_("products:list:{}");
    return item;
  }

  if (action === "bulkUpsert") {
    const items = (payload.items || []).map(sanitizeProduct_);
    bulkUpsertByKey_(sheet, "id", items);
    clearCache_("products:list:{}");
    return { count: items.length };
  }

  if (action === "delete") {
    deleteByKey_(sheet, "id", payload.id);
    clearCache_("products:list:{}");
    return { deleted: true };
  }

  throw new Error("Unsupported products action: " + action);
}

function handleAssignments_(action, payload) {
  const sheet = getSheet_(SHEETS.ASSIGNMENTS);

  if (action === "list") {
    return readRows_(sheet);
  }

  if (action === "upsert") {
    const item = sanitizeAssignment_(payload.item);
    upsertByKey_(sheet, "productId", item);
    clearCache_("assignments:list:{}");
    return item;
  }

  if (action === "bulkUpsert") {
    const items = (payload.items || []).map(sanitizeAssignment_);
    bulkUpsertByKey_(sheet, "productId", items);
    clearCache_("assignments:list:{}");
    return { count: items.length };
  }

  throw new Error("Unsupported assignments action: " + action);
}

function handleInventorySessions_(action, payload) {
  const sheet = getSheet_(SHEETS.INVENTORY);

  if (action === "list") {
    const all = readRows_(sheet);
    return uniqueSessions_(all);
  }

  if (action === "upsert") {
    const item = sanitizeSession_(payload.item);
    const sessionRow = {
      recordId: "SESSION:" + item.sessionId,
      sessionId: item.sessionId,
      storeName: item.storeName,
      inventoryDate: item.inventoryDate,
      productId: "",
      location: "__SESSION__",
      quantity: "",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    upsertByKey_(sheet, "recordId", sessionRow);
    clearCache_("inventorySessions:list:{}");
    clearCache_("inventoryRecords:list:{}");
    return item;
  }

  throw new Error("Unsupported inventorySessions action: " + action);
}

function handleInventoryRecords_(action, payload) {
  const sheet = getSheet_(SHEETS.INVENTORY);

  if (action === "list") {
    return readRows_(sheet).filter(function (row) {
      return row.location !== "__SESSION__";
    });
  }

  if (action === "upsert") {
    const item = sanitizeRecord_(payload.item);
    upsertByKey_(sheet, "recordId", item);
    clearCache_("inventoryRecords:list:{}");
    return item;
  }

  throw new Error("Unsupported inventoryRecords action: " + action);
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
  const rows = values.map(function (line) {
    const row = {};
    header.forEach(function (key, index) {
      row[key] = line[index];
    });
    return row;
  });

  cache.put(cacheKey, JSON.stringify(rows), 15);
  return rows;
}

function upsertByKey_(sheet, keyName, item) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const header = HEADERS[sheet.getName()];
    const keyIndex = header.indexOf(keyName);
    const data = readRows_(sheet);
    const rowIndex = data.findIndex(function (row) {
      return String(row[keyName]) === String(item[keyName]);
    });

    const rowValues = header.map(function (key) {
      return item[key] !== undefined ? item[key] : "";
    });

    if (rowIndex < 0) {
      sheet.appendRow(rowValues);
      return;
    }

    sheet.getRange(rowIndex + 2, 1, 1, header.length).setValues([rowValues]);
  } finally {
    lock.releaseLock();
  }
}

function bulkUpsertByKey_(sheet, keyName, items) {
  if (!items || items.length === 0) {
    return;
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const header = HEADERS[sheet.getName()];
    const current = readRows_(sheet);
    const indexByKey = {};
    current.forEach(function (row, index) {
      indexByKey[String(row[keyName])] = index + 2;
    });

    items.forEach(function (item) {
      const key = String(item[keyName]);
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

function deleteByKey_(sheet, keyName, keyValue) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const rows = readRows_(sheet);
    const hit = rows.findIndex(function (row) {
      return String(row[keyName]) === String(keyValue);
    });
    if (hit < 0) {
      return;
    }
    sheet.deleteRow(hit + 2);
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

function sanitizeText_(value) {
  return String(value || "").replace(/[<>]/g, "").trim();
}

function sanitizeNumber_(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function sanitizeProduct_(item) {
  return {
    id: sanitizeText_(item.id),
    name: sanitizeText_(item.name),
    standard: sanitizeText_(item.standard),
    category: sanitizeText_(item.category),
    cost: sanitizeNumber_(item.cost),
    supplier: sanitizeText_(item.supplier),
    updatedAt: new Date().toISOString()
  };
}

function sanitizeAssignment_(item) {
  return {
    assignmentId: sanitizeText_(item.assignmentId),
    productId: sanitizeText_(item.productId),
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

function sanitizeSession_(item) {
  return {
    sessionId: sanitizeText_(item.sessionId),
    storeName: sanitizeText_(item.storeName),
    inventoryDate: sanitizeText_(item.inventoryDate),
    createdAt: sanitizeText_(item.createdAt) || new Date().toISOString()
  };
}

function sanitizeRecord_(item) {
  return {
    recordId: sanitizeText_(item.recordId),
    sessionId: sanitizeText_(item.sessionId),
    storeName: sanitizeText_(item.storeName),
    inventoryDate: sanitizeText_(item.inventoryDate),
    productId: sanitizeText_(item.productId),
    location: sanitizeText_(item.location),
    quantity: sanitizeNumber_(item.quantity),
    createdAt: sanitizeText_(item.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
