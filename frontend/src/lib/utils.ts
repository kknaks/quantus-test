import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("ko-KR").format(num);
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0].replace(/-/g, "");
}

export function formatPercent(num: number): string {
  return `${num.toFixed(2)}%`;
}

export function formatCurrency(num: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(num);
}
