import { Prisma } from '@prisma/client'

function prismaCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null
}

/** The record to update/delete does not exist (Prisma P2025). */
export function isNotFoundError(error: unknown): boolean {
  return prismaCode(error) === 'P2025'
}

/** Unique constraint violation, e.g. duplicate email (Prisma P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return prismaCode(error) === 'P2002'
}

/** Foreign key constraint failed, e.g. referencing a machine that does not exist (Prisma P2003). */
export function isForeignKeyError(error: unknown): boolean {
  return prismaCode(error) === 'P2003'
}

/** Parse a date string, returning null for anything `Date` cannot interpret. */
export function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return isNaN(date.getTime()) ? null : date
}
