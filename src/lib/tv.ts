export function slideDuration(title: string, takeaway: string) {
  const words = `${title} ${takeaway}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(15000, Math.max(6000, 4000 + words * 230));
}
