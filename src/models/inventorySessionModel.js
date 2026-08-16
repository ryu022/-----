export class InventorySessionModel {
  constructor({ sessionId, storeId, storeName, inventoryDate, createdAt }) {
    this.sessionId = sessionId;
    this.storeId = storeId;
    this.storeName = storeName;
    this.inventoryDate = inventoryDate;
    this.createdAt = createdAt;
  }

  static create({ sessionId, storeId, storeName, inventoryDate }) {
    return new InventorySessionModel({
      sessionId,
      storeId,
      storeName: storeName.trim(),
      inventoryDate: inventoryDate.trim(),
      createdAt: new Date().toISOString()
    });
  }
}
