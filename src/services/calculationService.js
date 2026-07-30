export const calculationService = {
  toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  },

  roundQuantity(value) {
    return Math.round(value * 1000) / 1000;
  },

  computeTotalQuantity(salesFloorQuantity, backyardQuantity) {
    return this.roundQuantity(this.toNumber(salesFloorQuantity) + this.toNumber(backyardQuantity));
  },

  computeAmount(cost, totalQuantity) {
    return this.roundQuantity(this.toNumber(cost) * this.toNumber(totalQuantity));
  }
};
