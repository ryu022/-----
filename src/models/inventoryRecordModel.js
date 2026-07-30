export class InventoryRecordModel {
  constructor({ recordId, sessionId, productId, location, quantity }) {
    this.recordId = recordId;
    this.sessionId = sessionId;
    this.productId = productId;
    this.location = location;
    this.quantity = quantity;
  }

  static create({ recordId, sessionId, productId, location, quantity }) {
    return new InventoryRecordModel({
      recordId,
      sessionId,
      productId,
      location,
      quantity: Number(quantity)
    });
  }
}
