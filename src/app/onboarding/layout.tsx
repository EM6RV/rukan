import type { Metadata } from "next";

export const metadata: Metadata = { title: { template: "%s | رُكن", default: "رُكن" } };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
