"use client";

import { useContext } from "react";
import { AppContext, INR_TO_CURRENCY, currencySymbols } from "./app-provider";

// Fallback formatCurrency when AppProvider context is unavailable (e.g. SSR)
function fallbackFormatCurrency(amountInINR: number): string {
  return `₹${amountInINR.toFixed(2)}`;
}

export default function FormattedCurrency({ value, className }: { value: number | string, className?: string }) {
  const context = useContext(AppContext);

  // Clean up if it's a string like "$12.34"
  const numericValue = typeof value === "string"
    ? parseFloat(value.replace(/[^0-9.-]+/g, ""))
    : value;

  const formatted = context
    ? context.formatCurrency(numericValue || 0)
    : fallbackFormatCurrency(numericValue || 0);

  return <span className={className}>{formatted}</span>;
}

export function CurrencySymbol() {
  const context = useContext(AppContext);
  const symbols: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
  };
  const currency = context?.currency ?? "INR";
  return <>{symbols[currency] || "₹"}</>;
}
