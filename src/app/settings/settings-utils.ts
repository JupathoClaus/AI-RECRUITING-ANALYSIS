export function formatRoleLabel(role?: string | null): string {
  if (!role) return "Viewer"

  return role
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
