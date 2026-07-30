import { gasApiClient } from "./gasApiClient.js";

const STORAGE_KEY = "inventory-app-assignments-v1";

const clone = (value) => structuredClone(value);

const FALLBACK_SEED = [
  {
    assignmentId: "A000001",
    productId: "P000001",
    isTarget: true,
    salesFloor: true,
    backyard: true,
    materials: false,
    salesFloorOrder: 1,
    backyardOrder: 2,
    materialsOrder: null,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z"
  }
];

const toMap = (assignments) => new Map(assignments.map((item) => [item.productId, item]));

export class AssignmentRepository {
  constructor() {
    this.assignments = [];
    this.lastSyncError = "";
  }

  async initialize() {
    const local = window.localStorage.getItem(STORAGE_KEY);

    if (local) {
      this.assignments = JSON.parse(local);
    } else {
      try {
        const response = await fetch("./src/assets/assignments.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load assignments: ${response.status}`);
        }
        this.assignments = await response.json();
      } catch {
        this.assignments = clone(FALLBACK_SEED);
      }
      this.persist();
    }

    if (gasApiClient.isEnabled()) {
      await this.pullFromGas();
    }
  }

  getAll() {
    return clone(this.assignments);
  }

  getByProductId(productId) {
    return clone(this.assignments.find((item) => item.productId === productId));
  }

  setAll(nextAssignments) {
    const previous = this.assignments;
    this.assignments = clone(nextAssignments);
    this.persist();
    this.pushDiff(previous, this.assignments);
  }

  updateByProductId(productId, patch) {
    const index = this.assignments.findIndex((item) => item.productId === productId);
    if (index < 0) {
      return null;
    }

    this.assignments[index] = {
      ...this.assignments[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };

    this.persist();
    this.pushUpsert(this.assignments[index]);
    return clone(this.assignments[index]);
  }

  nextAssignmentId() {
    const max = this.assignments.reduce((acc, item) => {
      const numeric = Number(item.assignmentId.replace(/^A/, ""));
      return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
    }, 0);

    return `A${String(max + 1).padStart(6, "0")}`;
  }

  persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.assignments));
  }

  async pullFromGas() {
    try {
      const remoteAssignments = await gasApiClient.request({
        entity: "assignments",
        action: "list",
        payload: {},
        cacheable: true
      });

      if (Array.isArray(remoteAssignments) && remoteAssignments.length > 0) {
        this.assignments = remoteAssignments;
        this.persist();
      } else if (this.assignments.length > 0) {
        await gasApiClient.request({
          entity: "assignments",
          action: "bulkUpsert",
          payload: { items: this.assignments }
        });
      }
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : "assignment pull failed";
    }
  }

  pushDiff(previous, next) {
    if (!gasApiClient.isEnabled()) {
      return;
    }

    const prevMap = toMap(previous);
    const nextMap = toMap(next);
    const changed = [];

    nextMap.forEach((item, productId) => {
      const before = prevMap.get(productId);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
        changed.push(item);
      }
    });

    if (changed.length === 0) {
      return;
    }

    void gasApiClient
      .request({
        entity: "assignments",
        action: "bulkUpsert",
        payload: { items: changed }
      })
      .catch((error) => {
        this.lastSyncError = error instanceof Error ? error.message : "assignment diff sync failed";
      });
  }

  pushUpsert(item) {
    if (!gasApiClient.isEnabled()) {
      return;
    }

    void gasApiClient
      .request({
        entity: "assignments",
        action: "upsert",
        payload: { item }
      })
      .catch((error) => {
        this.lastSyncError = error instanceof Error ? error.message : "assignment upsert failed";
      });
  }
}
