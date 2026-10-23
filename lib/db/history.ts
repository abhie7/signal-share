import { openDB, DBSchema, IDBPDatabase } from "idb"

export interface TransferHistoryRecord {
  id: string
  type: "sent" | "received"
  peerName: string
  files: Array<{ name: string; size: number }>
  totalSize: number
  timestamp: number
}

interface SignalShareDB extends DBSchema {
  history: {
    key: string
    value: TransferHistoryRecord
    indexes: { "by-timestamp": number }
  }
}

const DB_NAME = "signal-share-db"
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<SignalShareDB>> | null = null

if (typeof window !== "undefined") {
  dbPromise = openDB<SignalShareDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore("history", { keyPath: "id" })
      store.createIndex("by-timestamp", "timestamp")
    },
  })
}

export const historyDB = {
  async addTransaction(record: TransferHistoryRecord) {
    if (!dbPromise) return
    const db = await dbPromise
    await db.put("history", record)
  },

  async getAllTransactions(): Promise<TransferHistoryRecord[]> {
    if (!dbPromise) return []
    const db = await dbPromise
    const all = await db.getAllFromIndex("history", "by-timestamp")
    return all.reverse() // Newest first
  },

  async clearHistory() {
    if (!dbPromise) return
    const db = await dbPromise
    await db.clear("history")
  },
}
