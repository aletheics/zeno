import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names (shadcn-style). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
