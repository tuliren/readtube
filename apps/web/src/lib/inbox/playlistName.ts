/**
 * User-facing display label for a playlist. When the user has set a
 * custom name, show it as the primary label and append the original
 * in parentheses.
 */
export function playlistDisplayName(playlist: { name: string; customName: string | null }): string {
  if (playlist.customName != null && playlist.customName.length > 0) {
    return `${playlist.customName} (${playlist.name})`;
  }
  return playlist.name;
}
