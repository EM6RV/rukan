import type { Metadata } from "next";
import { getDb } from "@/db";
import { listAnnouncements } from "@/server/admin/announcements";
import { AnnouncementManager } from "./announcement-manager";

export const metadata: Metadata = { title: "الإعلانات" };

export default async function AdminAnnouncements() {
  const items = await listAnnouncements(getDb());
  return (
    <>
      <div><h1 className="text-2xl">الإعلانات</h1><p className="text-muted">تظهر لكل البياعين في لوحاتهم، وكل واحد يقدر يغلقها.</p></div>
      <AnnouncementManager items={items} />
    </>
  );
}
