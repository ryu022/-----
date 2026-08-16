export class InventorySessionModel {
  constructor({
    sessionId,
    storeId,
    storeName,
    inventoryDate,
    createdAt,
    status = "draft",
    completedAt = "",
    completedBy = "",
    updatedAt,
    updatedBy = ""
  }) {
    this.sessionId = sessionId;
    this.storeId = storeId;
    this.storeName = storeName;
    this.inventoryDate = inventoryDate;
    this.createdAt = createdAt;
    this.status = status;
    this.completedAt = completedAt;
    this.completedBy = completedBy;
    this.updatedAt = updatedAt;
    this.updatedBy = updatedBy;
  }

  static create({ sessionId, storeId, storeName, inventoryDate, updatedBy = "" }) {
    const now = new Date().toISOString();
    return new InventorySessionModel({
      sessionId,
      storeId,
      storeName: storeName.trim(),
      inventoryDate: inventoryDate.trim(),
      createdAt: now,
      status: "draft",
      completedAt: "",
      completedBy: "",
      updatedAt: now,
      updatedBy
    });
  }
}
