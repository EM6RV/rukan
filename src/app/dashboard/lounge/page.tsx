import type { Metadata } from "next";
import { LineHome } from "@/components/dashboard/line-home";
import { requireLineContext } from "@/server/store-context";

export const metadata: Metadata = { title: "رُكن بلاي" };

export default async function LoungeHome() {
  await requireLineContext("lounge", "dashboard");
  return <LineHome line="lounge" />;
}
