import Link from "next/link";
import Image from "next/image";

export function Brand({ ariaLabel = "返回 Plum 首页" }: { ariaLabel?: string } = {}) {
  return (
    <Link href="/" className="brand" aria-label={ariaLabel}>
      <Image className="brand-logo" src="/plumlogo.svg" alt="" width={161} height={39} priority />
    </Link>
  );
}

export function CoinBadge({ balance, compact = false, title = "模拟金币余额", label = "金币" }: { balance: number; compact?: boolean; title?: string; label?: string }) {
  return (
    <div className={`coin-badge${compact ? " compact" : ""}`} title={title}>
      <span className="coin-icon">✦</span>
      <strong>{balance.toLocaleString("zh-CN")}</strong>
      {!compact && <span>{label}</span>}
    </div>
  );
}
