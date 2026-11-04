// يولّد مفاتيح VAPID لإشعارات Web Push. شغّله مرة وحدة وحط القيم في Render (Environment).
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log("حط هذي القيم في متغيرات البيئة (الخاص سري، ما يتشاركش):\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:support@rukn.ly   # أو بريدك الحقيقي");
