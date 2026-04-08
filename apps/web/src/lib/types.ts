export interface ChannelData {
  id: string;
  channelId: string;
  name: string;
  rssUrl: string;
  createdAt: string;
  unreadCount: number;
}

export interface VideoData {
  id: string;
  videoId: string;
  title: string;
  description: string | null;
  publishedAt: string;
  readAt: string | null;
  channelId: string;
  channelName: string;
  channelYtId: string;
}
