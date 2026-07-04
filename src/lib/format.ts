export function formatBRL(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function todayISODate(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
