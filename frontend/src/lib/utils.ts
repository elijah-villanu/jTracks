import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Today's date as `YYYY-MM-DD`, matching the shared contract's date fields and native `<input type="date">`. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}
