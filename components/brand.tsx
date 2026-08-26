import Link from "next/link";
import Image from "next/image";

export function Brand({ ariaLabel = "Plum home" }: { ariaLabel?: string } = {}) {
  return (
    <Link href="/" className="brand" aria-label={ariaLabel}>
      <Image className="brand-logo" src="/plumlogo.svg" alt="" width={161} height={39} priority />
    </Link>
  );
}
