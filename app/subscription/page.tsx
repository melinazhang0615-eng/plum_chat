"use client";

import { useState } from "react";
import { AccountPageShell, useAccountPage } from "@/components/account-page-shell";

const PLANS = [
  { id: "free", name: "Free", price: "$0", description: "A simple way to explore Plum.", features: ["Browse the character catalog", "Try the free model", "Create a personal Studio"] },
  { id: "standard", name: "Standard", price: "$—", description: "More room for regular conversations.", features: ["Higher chat allowance", "Standard model access", "Priority account support"] },
  { id: "premium", name: "Premium", price: "$—", description: "For deeper, longer-running stories.", features: ["Premium model access", "Higher wallet benefits", "Early product access"] },
] as const;

function SubscriptionContent() {
  useAccountPage();
  const [selectedPlan, setSelectedPlan] = useState("free");
  return <>
    <section className="subscription-current"><div><span className="account-muted-label">Current plan</span><h2>Free</h2><p>Your current account is on the Free plan.</p></div><span className="account-status-pill active">Active</span></section>
    <section className="account-section"><div className="account-section-heading"><div><h2>Plans</h2><p>Choose the plan that fits how you use Plum.</p></div></div><div className="plan-grid">{PLANS.map((plan) => <button key={plan.id} className={`plan-card${selectedPlan === plan.id ? " selected" : ""}`} onClick={() => setSelectedPlan(plan.id)}><span className="plan-card-top"><strong>{plan.name}</strong><b>{plan.price}</b></span><p>{plan.description}</p><span className="plan-features">{plan.features.map((feature) => <small key={feature}>✓ {feature}</small>)}</span>{plan.id === "free" && <em>Current plan</em>}</button>)}</div><button className="account-primary-button" disabled={selectedPlan === "free"}>Continue with {PLANS.find((plan) => plan.id === selectedPlan)?.name} · Billing pending</button></section>
  </>;
}

export default function SubscriptionPage() {
  return <AccountPageShell active="subscription" eyebrow="PLUM PLANS" title="Subscription" description="Choose the access level that fits your stories."><SubscriptionContent /></AccountPageShell>;
}
