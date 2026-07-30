export class AssignmentModel {
  constructor({
    assignmentId,
    productId,
    isTarget,
    salesFloor,
    backyard,
    materials,
    salesFloorOrder,
    backyardOrder,
    materialsOrder,
    createdAt,
    updatedAt
  }) {
    this.assignmentId = assignmentId;
    this.productId = productId;
    this.isTarget = Boolean(isTarget);
    this.salesFloor = Boolean(salesFloor);
    this.backyard = Boolean(backyard);
    this.materials = Boolean(materials);
    this.salesFloorOrder = salesFloorOrder ?? null;
    this.backyardOrder = backyardOrder ?? null;
    this.materialsOrder = materialsOrder ?? null;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create({ assignmentId, productId }) {
    const now = new Date().toISOString();

    return new AssignmentModel({
      assignmentId,
      productId,
      isTarget: false,
      salesFloor: false,
      backyard: false,
      materials: false,
      salesFloorOrder: null,
      backyardOrder: null,
      materialsOrder: null,
      createdAt: now,
      updatedAt: now
    });
  }
}
