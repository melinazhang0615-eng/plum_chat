"use client";

import { useState } from "react";
import { AccountPageShell, useAccountPage } from "@/components/account-page-shell";

function WalletContent() {
  const { balance } = useAccountPage();
  const [selectedAmount, setSelectedAmount] = useState(500);
  return <>
    <section className="wallet-balance-banner"><div><span className="account-muted-label">Available balance</span><strong>{balance.toLocaleString("en-US")}</strong><small>Plum coins</small></div><span className="wallet-spark">✦</span></section>
    <section className="account-section">
      <div className="account-section-heading"><div><h2>Add coins</h2><p>Choose an amount to prepare your top-up.</p></div><span className="account-status-pill">Payments pending</span></div>
      <div className="wallet-amount-grid">{[100, 500, 1000].map((amount) => <button key={amount} className={selectedAmount === amount ? "selected" : ""} onClick={() => setSelectedAmount(amount)}><strong>{amount.toLocaleString()}</strong><small>coins</small></button>)}</div>
      <button className="account-primary-button" disabled>Continue to payment · {selectedAmount} coins</button>
    </section>
    <section className="account-section wallet-history-section"><div className="account-section-heading"><div><h2>Transaction history</h2><p>Your coin activity will appear here.</p></div></div><div className="account-empty-state"><span>✦</span><strong>No transactions yet</strong><p>Top-ups and message charges will be listed after wallet billing is connected.</p></div></section>
  </>;
}

export default function WalletPage() {
  return <AccountPageShell active="wallet" eyebrow="PLUM WALLET" title="Wallet" description="See your balance and manage the coins used for conversations."><WalletContent /></AccountPageShell>;
}
