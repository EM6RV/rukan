// محتوى موقع رُكن التسويقي: القيم الافتراضية والأنواع (ملف محايد). الأدمن يعدلها من اللوحة وتتخزن في site_content.
export const FEATURE_ICONS = ["truck", "banknote", "rotate", "map", "message", "shield", "palette", "chart", "smartphone", "zap", "store", "users"] as const;
export type FeatureIcon = (typeof FEATURE_ICONS)[number];
export const FEATURE_ICON_LABELS: Record<FeatureIcon, string> = {
  truck: "توصيل", banknote: "دفع", rotate: "مرتجعات", map: "مدن", message: "واتساب", shield: "أمان", palette: "تصميم", chart: "تقارير", smartphone: "موبايل", zap: "سرعة", store: "متجر", users: "فريق",
};

export type SiteContent = {
  hero: { badge: string; title: string; subtitle: string; primaryCta: string; secondaryCta: string; imageMediaId: string | null };
  features: { title: string; subtitle: string; items: { icon: FeatureIcon; title: string; text: string }[] };
  showcase: { title: string; subtitle: string; items: { name: string; category: string; primary: string; accent: string; template: import("./constants").StoreTemplate; href: string }[] };
  steps: { title: string; items: { title: string; text: string }[] };
  pricing: { title: string; subtitle: string; note: string };
  faq: { title: string; items: { q: string; a: string }[] };
  cta: { title: string; subtitle: string; button: string };
  footer: { text: string };
  seo: { title: string; description: string };
};

export const DEFAULT_SITE_CONTENT: SiteContent = {
  hero: {
    badge: "منصة المتاجر الإلكترونية الليبية",
    title: "ركنك في السوق… أونلاين.",
    subtitle: "تبيع من إنستغرام أو تيك توك أو عندك محل؟ سجّل في دقيقتين ويطلع عندك متجر إلكتروني جاهز، مع الدفع عند الاستلام والمندوبين والمرتجعات ومدن ليبيا.",
    primaryCta: "افتح متجرك مجاناً",
    secondaryCta: "شوف الأسعار",
    imageMediaId: null,
  },
  features: {
    title: "كل اللي يحتاجه بياع ليبي",
    subtitle: "مش مجرد متجر: أدوات مفصلة على طريقة البيع عندنا.",
    items: [
      { icon: "banknote", title: "الدفع عند الاستلام", text: "الطريقة الأساسية عند الزباين، مع تحويل مصرفي برفع الإيصال وأماكن جاهزة للبوابات المحلية." },
      { icon: "truck", title: "مندوبين وشركات توصيل", text: "عيّن المندوب، تابع الشحنة، وسجّل الكاش اللي عند كل واحد وسوّي التسوية بسهولة." },
      { icon: "rotate", title: "مرتجعات منظمة", text: "سجّل المرتجع وسببه، والمنتج يرجع للمخزون تلقائياً، وتعرف كم ضاع عليك في التوصيل." },
      { icon: "map", title: "مدن ليبيا جاهزة", text: "أسعار توصيل لكل مدينة تقدر تعدلها، وتوصيل مجاني فوق مبلغ تحدده." },
      { icon: "message", title: "واتساب في كل خطوة", text: "زر واتساب عائم، ورسائل جاهزة لكل حالة طلبية تقدر تعدلها، وتأكيد الطلب بضغطة." },
      { icon: "smartphone", title: "سريع على الموبايل", text: "زباينك أغلبهم من إنستا وتيك توك، فمتجرك مصمم للموبايل أول وبتحميل سريع." },
    ],
  },
  showcase: {
    title: "متاجر بتصاميم مختلفة",
    subtitle: "8 قوالب مختلفة في الشكل، اختار اللي يناسب نشاطك، ولونه بألوان علامتك.",
    items: [
      { name: "عطور الندى", category: "عطور وعناية", primary: "#2B1B3D", accent: "#C19E58", template: "elegant", href: "" },
      { name: "شارع 218", category: "ملابس وشباب", primary: "#111111", accent: "#FF5A1F", template: "bold", href: "" },
      { name: "لمسة", category: "إكسسوارات وهدايا", primary: "#0D263E", accent: "#087C86", template: "simple", href: "" },
      { name: "بيت الحلا", category: "حلويات وأكل بيتي", primary: "#7A3E12", accent: "#E0A030", template: "warm", href: "" },
      { name: "خيط", category: "أزياء وإكسسوارات", primary: "#111111", accent: "#C19E58", template: "editorial", href: "" },
      { name: "ذهب ليبيا", category: "عطور وذهب", primary: "#12372A", accent: "#D9B65C", template: "noir", href: "" },
    ],
  },
  steps: {
    title: "ابدا في 3 خطوات",
    items: [
      { title: "سجّل برقمك", text: "رقم هاتف وكلمة سر، وفي دقيقتين متجرك جاهز." },
      { title: "ضيف منتجاتك", text: "صور، مقاسات وألوان بمخزون، أو استورد من Excel." },
      { title: "شارك الرابط", text: "حطه في البايو على إنستغرام وتيك توك وابدأ استقبال الطلبيات." },
    ],
  },
  pricing: { title: "أسعار واضحة", subtitle: "جرّب مجاناً أول، وادفع كاش أو تحويل لما تعجبك.", note: "الدفع يدوي (كاش أو تحويل) والاشتراك يتفعل مباشرة. خصم على الدفع السنوي." },
  faq: {
    title: "أسئلة شائعة",
    items: [
      { q: "كيف أدفع الاشتراك؟", a: "الدفع كاش أو تحويل مصرفي، تتواصل معانا وبعد الدفع نفعّل اشتراكك فوراً." },
      { q: "شن يصير لما تخلص الفترة التجريبية؟", a: "متجرك يتقفل للزباين واللوحة تبقى للقراءة فقط لين تجدد الاشتراك. بياناتك ما تضيعش." },
      { q: "أقدر أربط دومين خاص بي؟", a: "إيه، الدومين الخاص متاح في باقة «سنوية برو»." },
      { q: "أقدر أغير الباقة بعدين؟", a: "طبعاً، ترقّي في أي وقت وتكمل بدون ما تفقد شي." },
      { q: "هل لازم أعرف برمجة؟", a: "لا خالص. كل شي من اللوحة: المنتجات والتصميم والنصوص بدون كود." },
    ],
  },
  cta: { title: "جاهز تفتح ركنك؟", subtitle: "سجّل الحين وجرّب مجاناً، بدون بطاقة بنكية.", button: "افتح متجرك مجاناً" },
  footer: { text: "رُكن — ركنك في السوق… أونلاين." },
  seo: { title: "رُكن — افتح متجرك الإلكتروني في ليبيا", description: "منصة متاجر إلكترونية ليبية: دفع عند الاستلام، مندوبين، مرتجعات، ومدن ليبيا جاهزة. افتح متجرك مجاناً في دقيقتين." },
};
