import { PrismaClient } from '@prisma/client'

// One client for the whole process. SQLite allows a single writer at a time, so
// many independent clients (each with its own connection pool) only multiply
// "database is locked" errors under concurrent writes.
export const prisma = new PrismaClient()
