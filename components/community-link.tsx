const discordInviteUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim();

export function CommunityIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.3" /><path d="M3.5 19c.7-3.5 2.5-5.2 5.5-5.2s4.8 1.7 5.5 5.2M14.2 14.5c2.9-.7 5 .8 6.3 3.6" /></svg>;
}

export function CommunityLink({ className = "community-link" }: { className?: string }) {
  if (!discordInviteUrl) {
    return <span className={`${className} disabled`} aria-disabled="true" aria-label="Plum Discord is not configured"><CommunityIcon /><span>Community</span></span>;
  }
  return <a className={className} href={discordInviteUrl} target="_blank" rel="noopener noreferrer" aria-label="Join Plum on Discord"><CommunityIcon /><span>Community</span></a>;
}
