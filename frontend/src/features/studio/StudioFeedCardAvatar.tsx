type StudioFeedCardAvatarProps = {
  providerDisplayName: string;
};

export default function StudioFeedCardAvatar({ providerDisplayName }: StudioFeedCardAvatarProps) {
  return <div className="feed-card-avatar">{providerDisplayName.slice(0, 1).toUpperCase()}</div>;
}
