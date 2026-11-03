import type { Metadata } from "next";
import { LineHome } from "@/components/dashboard/line-home";
import { requireLineContext } from "@/server/store-context";

export const metadata: Metadata = { title: "رُكن فِت" };

export default async function GymHome() {
  await requireLineContext("gym", "dashboard");
  return <LineHome line="gym" />;
}
