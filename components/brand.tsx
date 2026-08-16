import Link from "next/link";

export function Brand({ ariaLabel = "Plum home" }: { ariaLabel?: string } = {}) {
  return (
    <Link href="/" className="brand" aria-label={ariaLabel}>
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>plum</span>
    </Link>
  );
}
