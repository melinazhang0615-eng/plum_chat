import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="返回 Plum 首页">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>plum</span>
    </Link>
  );
}

export function CoinBadge({ balance, compact = false }: { balance: number; compact?: boolean }) {
  return (
    <div className={`coin-badge${compact ? " compact" : ""}`} title="模拟金币余额">
      <span className="coin-icon">✦</span>
      <strong>{balance.toLocaleString("zh-CN")}</strong>
      {!compact && <span>金币</span>}
    </div>
  );
}
