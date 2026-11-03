import type { Metadata } from "next";
import { LineHome } from "@/components/dashboard/line-home";
import { requireLineContext } from "@/server/store-context";

export const metadata: Metadata = { title: "رُكن ماركت" };

export default async function MarketHome() {
  await requireLineContext("market", "dashboard");
  return <LineHome line="market" />;
}
