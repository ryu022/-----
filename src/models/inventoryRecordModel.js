export class InventoryRecordModel {
  constructor({ recordId, sessionId, productId, location, quantity, updatedAt = "", updatedBy = "" }) {
    this.recordId = recordId;
    this.sessionId = sessionId;
    this.productId = productId;
    this.location = location;
    this.quantity = quantity;
    this.updatedAt = updatedAt;
    this.updatedBy = updatedBy;
  }

  static create({ recordId, sessionId, productId, location, quantity, updatedAt = "", updatedBy = "" }) {
    return new InventoryRecordModel({
      recordId,
      sessionId,
      productId,
      location,
      quantity: Number(quantity),
      updatedAt,
      updatedBy
    });
  }
}
