'use client';

import { FolderIcon, Plus, Radio } from 'lucide-react';

import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { displayChannelName } from '@/lib/inbox/channelName';
import { partitionChannelsByFolder } from '@/lib/inbox/partitionChannels';
import type { ChannelData, FolderData } from '@/lib/types';
import { channelHref } from '@/lib/urls/channelHref';

import ChannelAvatar from './ChannelAvatar';
import { RailMenu, RailMenuLink, RailMenuRowContent } from './RailMenu';

interface Props {
  channels: ChannelData[];
  folders: FolderData[];
  selectedChannelId: string | null;
  onAddChannel: () => void;
}

/**
 * Collapsed-rail Channels category. The menu lists folders first, each
 * opening a submenu of its channels, then the root-level channels, so
 * a large subscription list stays two short levels deep.
 */
export default function RailChannelsMenu({
  channels,
  folders,
  selectedChannelId,
  onAddChannel,
}: Props) {
  const { rootChannels, byFolder } = partitionChannelsByFolder(channels, folders);

  const renderChannel = (channel: ChannelData) => (
    <RailMenuLink
      key={channel.id}
      href={channelHref(channel)}
      label={displayChannelName(channel.name)}
      unread={channel.unreadCount}
      active={channel.id === selectedChannelId}
      leading={<ChannelLeading channel={channel} />}
    />
  );

  return (
    <RailMenu icon={Radio} label="Channels" active={selectedChannelId != null}>
      {folders.map((folder) => {
        const folderChannels = byFolder.get(folder.id) ?? [];
        const unread = folderChannels.reduce((sum, c) => sum + c.unreadCount, 0);
        const containsSelected = folderChannels.some((c) => c.id === selectedChannelId);
        return (
          <DropdownMenuSub key={folder.id}>
            <DropdownMenuSubTrigger className={containsSelected ? 'font-medium' : undefined}>
              <RailMenuRowContent
                leading={<FolderIcon className="h-4 w-4 text-muted-foreground" />}
                label={folder.name}
                unread={unread}
              />
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 overflow-y-auto">
                {folderChannels.length === 0 ? (
                  <DropdownMenuItem disabled>Empty folder</DropdownMenuItem>
                ) : (
                  folderChannels.map(renderChannel)
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        );
      })}
      {folders.length > 0 && rootChannels.length > 0 && <DropdownMenuSeparator />}
      {rootChannels.map(renderChannel)}
      {channels.length === 0 && <DropdownMenuItem disabled>No channels yet</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onAddChannel}>
        <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
        Add channel
      </DropdownMenuItem>
    </RailMenu>
  );
}

function ChannelLeading({ channel }: { channel: ChannelData }) {
  if (channel.logoUrl != null) {
    return <ChannelAvatar url={channel.logoUrl} size={40} cssSize="h-5 w-5" />;
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
      {channel.name.charAt(0).toUpperCase()}
    </span>
  );
}
