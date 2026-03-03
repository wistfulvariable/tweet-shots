/**
 * In-memory Firestore mock for unit tests.
 * Implements the subset of Firestore API used by our services.
 *
 * Timestamps use a deterministic counter to avoid wall-clock dependence.
 * Call mock._resetTimestampCounter() in beforeEach to reset.
 */

import { vi } from 'vitest';

let _timestampCounter = 0;
function deterministicTimestamp() {
  _timestampCounter++;
  return `2024-01-15T00:00:${String(_timestampCounter).padStart(2, '0')}.000Z`;
}

class MockDocSnapshot {
  constructor(id, data) {
    this.id = id;
    this._data = data;
    this.exists = data !== undefined;
    this.ref = { id, update: vi.fn(async (updates) => this._applyUpdates(updates)) };
  }

  data() {
    return this._data ? structuredClone(this._data) : undefined;
  }

  _applyUpdates(updates) {
    if (!this._data) return;
    for (const [key, value] of Object.entries(updates)) {
      if (value?._type === 'increment') {
        this._data[key] = (this._data[key] || 0) + value._value;
      } else if (value?._type === 'serverTimestamp') {
        this._data[key] = deterministicTimestamp();
      } else {
        this._data[key] = value;
      }
    }
  }
}

class MockQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }
}

class MockDocRef {
  constructor(collection, id) {
    this._collection = collection;
    this.id = id;
  }

  async get() {
    const data = this._collection._store.get(this.id);
    return new MockDocSnapshot(this.id, data);
  }

  async set(data) {
    const resolved = resolveFieldValues(data);
    this._collection._store.set(this.id, resolved);
  }

  async update(updates) {
    const existing = this._collection._store.get(this.id);
    if (!existing) throw new Error(`Document ${this.id} does not exist`);

    for (const [key, value] of Object.entries(updates)) {
      if (value?._type === 'increment') {
        existing[key] = (existing[key] || 0) + value._value;
      } else if (value?._type === 'serverTimestamp') {
        existing[key] = deterministicTimestamp();
      } else {
        existing[key] = value;
      }
    }
  }

  async delete() {
    this._collection._store.delete(this.id);
  }
}

class MockCollectionRef {
  constructor() {
    this._store = new Map();
  }

  doc(id) {
    return new MockDocRef(this, id);
  }

  async get() {
    const docs = [];
    for (const [id, data] of this._store.entries()) {
      docs.push(new MockDocSnapshot(id, data));
    }
    return new MockQuerySnapshot(docs);
  }

  where(field, op, value) {
    return {
      limit: () => ({
        get: async () => {
          const matches = [];
          for (const [id, data] of this._store.entries()) {
            if (op === '==' && data[field] === value) {
              matches.push(new MockDocSnapshot(id, data));
            }
          }
          return new MockQuerySnapshot(matches);
        },
      }),
    };
  }
}

function resolveFieldValues(data) {
  const resolved = {};
  for (const [key, value] of Object.entries(data)) {
    if (value?._type === 'serverTimestamp') {
      resolved[key] = deterministicTimestamp();
    } else if (value?._type === 'increment') {
      resolved[key] = value._value;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Create mock Firestore collections and field values.
 * Returns objects that can be used to mock the firestore.mjs imports.
 */
export function createFirestoreMock() {
  const collections = {
    apiKeys: new MockCollectionRef(),
    usage: new MockCollectionRef(),
    customers: new MockCollectionRef(),
    subscriptions: new MockCollectionRef(),
  };

  const MockFieldValue = {
    increment: (n) => ({ _type: 'increment', _value: n }),
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  };

  return {
    collections,
    apiKeysCollection: () => collections.apiKeys,
    usageCollection: () => collections.usage,
    customersCollection: () => collections.customers,
    subscriptionsCollection: () => collections.subscriptions,
    FieldValue: MockFieldValue,
    MockCollectionRef,
    /** Reset the deterministic timestamp counter (call in beforeEach) */
    resetTimestampCounter() { _timestampCounter = 0; },
  };
}
