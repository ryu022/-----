const ORDER_KEYS = ["salesFloorOrder", "backyardOrder", "materialsOrder"];

export const assignmentValidator = {
  validatePatch(patch) {
    const errors = {};

    if ("isTarget" in patch && typeof patch.isTarget !== "boolean") {
      errors.isTarget = "棚卸対象は真偽値で指定してください。";
    }

    ["salesFloor", "backyard", "materials"].forEach((key) => {
      if (key in patch && typeof patch[key] !== "boolean") {
        errors[key] = `${key} は真偽値で指定してください。`;
      }
    });

    ORDER_KEYS.forEach((key) => {
      if (key in patch && patch[key] !== null && (!Number.isInteger(patch[key]) || patch[key] < 1)) {
        errors[key] = `${key} は1以上の整数またはnullで指定してください。`;
      }
    });

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
};
