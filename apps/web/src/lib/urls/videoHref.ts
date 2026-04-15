export function videoHref(video: { sourceId: string }): string {
  return `/videos/${encodeURIComponent(video.sourceId)}`;
}
