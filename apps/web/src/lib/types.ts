export interface ChannelData {
  id: string;
  sourceId: string;
  name: string;
  rssUrl: string;
  createdAt: string;
  unreadCount: number;
}

export interface VideoData {
  id: string;
  sourceId: string;
  title: string;
  description: string | null;
  publishedAt: string;
  readAt: string | null;
  channelId: string;
  channelName: string;
  channelSourceId: string;
}
