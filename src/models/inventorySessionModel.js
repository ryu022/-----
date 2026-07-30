export class InventorySessionModel {
  constructor({ sessionId, storeName, inventoryDate, createdAt }) {
    this.sessionId = sessionId;
    this.storeName = storeName;
    this.inventoryDate = inventoryDate;
    this.createdAt = createdAt;
  }

  static create({ sessionId, storeName, inventoryDate }) {
    return new InventorySessionModel({
      sessionId,
      storeName: storeName.trim(),
      inventoryDate: inventoryDate.trim(),
      createdAt: new Date().toISOString()
    });
  }
}
