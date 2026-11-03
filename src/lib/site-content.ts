// محتوى موقع رُكن التسويقي: القيم الافتراضية والأنواع (ملف محايد). الأدمن يعدلها من اللوحة وتتخزن في site_content.
export const FEATURE_ICONS = ["truck", "banknote", "rotate", "map", "message", "shield", "palette", "chart", "smartphone", "zap", "store", "users"] as const;
export type FeatureIcon = (typeof FEATURE_ICONS)[number];
export const FEATURE_ICON_LABELS: Record<FeatureIcon, string> = {
  truck: "توصيل", banknote: "دفع", rotate: "مرتجعات", map: "مدن", message: "واتساب", shield: "أمان", palette: "تصميم", chart: "تقارير", smartphone: "موبايل", zap: "سرعة", store: "متجر", users: "فريق",
};

export type SiteContent = {
  hero: { badge: string; title: string; subtitle: string; primaryCta: string; secondaryCta: string; imageMediaId: string | null };
  /** شريط الثقة تحت الهيرو. الشركاء: شركات ليبية مربوطة فعلاً (يضيفها الأدمن؛ فاضية = ما تبان) */
  trust: { items: string[]; partnersTitle: string; partners: { name: string }[] };
  features: { title: string; subtitle: string; items: { icon: FeatureIcon; title: string; text: string }[] };
  /** «شن نشاطك؟»: كل نشاط له صفحة /for/[slug] */
  niches: { title: string; subtitle: string; items: Niche[] };
  /** «رُكن مش بس متجر»: ثلاث منظومات بصفحة لكل واحدة /systems/[slug] */
  systems: { title: string; subtitle: string; items: SystemCard[] };
  /** معرض القوالب الستة بمعاينة حية */
  templates: { title: string; subtitle: string; button: string; items: { template: import("./constants").StoreTemplate; blurb: string; primary: string; accent: string }[] };
  /** مميزات كقصص قصيرة */
  stories: { title: string; subtitle: string; items: { icon: FeatureIcon; title: string; text: string; points: string[] }[] };
  showcase: { title: string; subtitle: string; items: { name: string; category: string; primary: string; accent: string; template: import("./constants").StoreTemplate; href: string }[] };
  design: { title: string; subtitle: string; button: string; items: { title: string; text: string }[] };
  steps: { title: string; items: { title: string; text: string }[] };
  pricing: { title: string; subtitle: string; note: string; popularBadge: string; compareTitle: string; compareSubtitle: string; rows: Record<string, string> };
  faq: { title: string; items: { q: string; a: string }[] };
  cta: { title: string; subtitle: string; button: string };
  footer: { text: string };
  seo: { title: string; description: string };
};

export type SystemSlug = "market" | "play" | "fit";
export type SystemCard = { slug: SystemSlug; name: string; tagline: string; text: string; points: string[]; cta: string };
export const SYSTEM_LINE: Record<SystemSlug, "market" | "lounge" | "gym"> = { market: "market", play: "lounge", fit: "gym" };
export const DEFAULT_SYSTEMS: SystemCard[] = [
  { slug: "market", name: "رُكن ماركت", tagline: "كاشير ومخزون للبقالة والسوبرماركت", text: "كاشير سريع بالباركود والميزان، وشغال بدون نت. دفتر ديون الزباين، وصلاحيات الدفعات، وجرد بكاميرا الموبايل.", points: ["كاشير يشتغل بدون إنترنت ويزامن بعدين", "باركود وميزان وأصناف بالوزن", "دفعات وتواريخ صلاحية وهالك", "ديون الزباين ومحافظهم ونقاط الولاء", "اقتراح شراء حسب المبيعات"], cta: "جرّب رُكن ماركت" },
  { slug: "play", name: "رُكن بلاي", tagline: "إدارة صالة الألعاب بالساعة والماتش", text: "عدّاد لكل جهاز بتسعير بالساعة أو الماتش، باقات ساعات، حجوزات، شاشة حائط، وبطولات بقرعة وترتيب تلقائي.", points: ["عدّاد وتسعير لكل جهاز وغرفة VIP", "باقات ساعات ومحافظ للاعبين", "حجز مسبق ومنع التعارض", "شاشة حائط بحالة الأجهزة والبطولات", "تقارير الإشغال والذروة"], cta: "جرّب رُكن بلاي" },
  { slug: "fit", name: "رُكن فِت", tagline: "إدارة النادي: أعضاء واشتراكات ودخول", text: "اشتراكات بالأقساط والتجميد والترقية، دخول بالباركود أو الهاتف، حصص بقائمة انتظار، مدربين بعمولات، وصفحة شخصية لكل عضو.", points: ["أنواع اشتراك وأقساط وتجميد وترقية", "دخول بالباركود أو كشك عند الباب", "حصص جماعية وحجز وقائمة انتظار", "مدربين وحصص PT وعمولات", "رسائل واتساب جاهزة للتجديد والأقساط"], cta: "جرّب رُكن فِت" },
];

export type Niche = { slug: string; title: string; headline: string; text: string; benefits: string[]; template: import("./constants").StoreTemplate; primary: string; accent: string; example: string };

export const DEFAULT_NICHES: Niche[] = [
  { slug: "clothing", title: "ملابس وشباب", headline: "محلك للملابس يبان كبراند في إنستا", text: "مقاسات وألوان بمخزون لكل خيار، وعروض بعداد تنازلي، وطلبيات تنزل لك جاهزة للمندوب.", benefits: ["مقاس ولون بمخزون مستقل لكل خيار", "شارات «باقي 3 قطع» وتخفيضات قوية", "مرتجعات منظمة ورجوع القطعة للمخزون"], template: "nabd", primary: "#111111", accent: "#FF5A1F", example: "شارع 218" },
  { slug: "perfume", title: "عطور", headline: "فخامة عطورك تبان من أول نظرة", text: "قالب بخط رفيع وتفاصيل ذهبية، وعروض هدايا وأحجام متعددة بسعر لكل حجم.", benefits: ["أحجام (30/50/100 مل) بسعر ومخزون لكل حجم", "باقات هدايا مجمعة", "تواريخ انتهاء وتنبيه قبلها"], template: "makhmal", primary: "#2B1B3D", accent: "#C19E58", example: "عطور الندى" },
  { slug: "beauty", title: "عناية وتجميل", headline: "منتجات عنايتك بصور نظيفة وتقييمات حقيقية", text: "تقييمات من زباين اشتروا فعلاً، وتواريخ صلاحية، ومكونات المنتج واضحة.", benefits: ["تقييمات مشترين موثّقين", "تنبيه قرب انتهاء الصلاحية", "كوبونات وعروض موسمية"], template: "makhmal", primary: "#7A2E4A", accent: "#E3B7A0", example: "بشرة" },
  { slug: "home-food", title: "أكل بيتي", headline: "طبخك البيتي وقصتك قدام الزبون", text: "قالب بقصة البراند وصور كبيرة، وطلب سريع بالدفع عند الاستلام وتوصيل داخل مدينتك.", benefits: ["قصتك وصورك أول شي", "طلب سريع بدون حساب", "توصيل مجاني فوق مبلغ تحدده"], template: "hikaya", primary: "#7A3E12", accent: "#E0A030", example: "بيت الحلا" },
  { slug: "electronics", title: "إلكترونيات وكتالوجات كبيرة", headline: "مئات المنتجات بترتيب وبحث سريع", text: "أقسام كبيرة وفلترة بالسعر والبراند والتوفر، وبحث باقتراحات من أول حرف، وتعدد المخازن لما تكبر.", benefits: ["فلترة متقدمة وبحث ذكي", "استيراد منتجاتك من Excel", "مخازن ومشتريات وحسابات لما تكبر"], template: "souq", primary: "#0D263E", accent: "#087C86", example: "سوق التقنية" },
  { slug: "gifts", title: "هدايا وإكسسوارات", headline: "هداياك بتغليف ورسالة إهداء", text: "خانة نقش أو رسالة إهداء على المنتج بسعر إضافي اختياري، وتظهر في الفاتورة والبوليصة.", benefits: ["نقش وكتابة إهداء بحد حروف", "ألوان ناعمة بألوان علامتك", "طباعة حرارية للفاتورة والبوليصة"], template: "lamsa", primary: "#0D263E", accent: "#087C86", example: "لمسة" },
];

export const DEFAULT_SITE_CONTENT: SiteContent = {
  hero: {
    badge: "منصة المتاجر الإلكترونية الليبية",
    title: "ركنك في السوق… أونلاين.",
    subtitle: "تبيع من إنستغرام أو تيك توك أو عندك محل؟ سجّل في دقيقتين ويطلع عندك متجر إلكتروني جاهز، مع الدفع عند الاستلام والمندوبين والمرتجعات ومدن ليبيا.",
    primaryCta: "افتح متجرك مجاناً",
    secondaryCta: "شوف الأسعار",
    imageMediaId: null,
  },
  trust: { items: ["الدفع عند الاستلام", "بالدينار الليبي", "توصيل لكل مدن ليبيا", "واجهة عربية بالكامل"], partnersTitle: "شركاء التوصيل والدفع", partners: [] },
  systems: { title: "رُكن مش بس متجر", subtitle: "نفس الحساب، وكل نشاطك في مكان واحد: ماركت، صالة ألعاب، أو نادي.", items: DEFAULT_SYSTEMS },
  niches: { title: "شن نشاطك؟", subtitle: "اختار نشاطك وشوف كيف رُكن يفيدك، والقالب المناسب، ومثال جاهز.", items: DEFAULT_NICHES },
  templates: {
    title: "ستة قوالب بشخصيات مختلفة",
    subtitle: "كل قالب يتلون بألوان علامتك ويقبل الخط اللي تختاره. شوف شكله على موبايل قبل ما تبدأ.",
    button: "جرّب القالب",
    items: [
      { template: "naqa", blurb: "بساطة كاملة ومساحات فاضية. الأسرع، لأي نشاط.", primary: "#0D263E", accent: "#087C86" },
      { template: "makhmal", blurb: "فخامة تحريرية للعطور والعناية والمجوهرات.", primary: "#2B1B3D", accent: "#C19E58" },
      { template: "nabd", blurb: "جريء بخط عريض وشارات تخفيض قوية للملابس والعروض.", primary: "#111111", accent: "#FF5A1F" },
      { template: "souq", blurb: "للكتالوجات الكبيرة: أقسام وفلترة وبحث بالاقتراحات.", primary: "#0D263E", accent: "#C19E58" },
      { template: "hikaya", blurb: "قصة البراند أولاً، للأكل البيتي والصناعة اليدوية.", primary: "#7A3E12", accent: "#E0A030" },
      { template: "lamsa", blurb: "ناعم ومرح للهدايا والإكسسوارات والأطفال.", primary: "#7A2E4A", accent: "#E3B7A0" },
    ],
  },
  stories: {
    title: "شغل ليبي بتفاصيله",
    subtitle: "مش ميزات مرصوصة: حكايات من يوم البياع الليبي.",
    items: [
      { icon: "truck", title: "المندوب والكاش", text: "المندوب يسلّم الطلبية ويستلم الفلوس. وأنت تعرف في أي لحظة كم عند كل مندوب، وتسوّي معاه بضغطة.", points: ["كاش كل مندوب في حساب مستقل", "تسوية واستلام فلوس مسجلين", "صفحة خاصة للمندوب على موبايله"] },
      { icon: "rotate", title: "المرتجعات", text: "الزبون رفض الطلبية؟ سجّل السبب، والقطعة ترجع للمخزون لوحدها، وتعرف كم ضاع عليك في التوصيل.", points: ["أسباب جاهزة للمرتجع", "رجوع تلقائي للمخزون", "تكلفة التوصيل الضايعة في التقارير"] },
      { icon: "message", title: "واتساب في كل خطوة", text: "رسالة جاهزة لكل حالة طلبية، وتذكير للسلات المتروكة برابط يرجّع للزبون سلته.", points: ["رسائل تعدلها بنفسك", "تذكير سلات متروكة", "تأكيد الطلب بضغطة"] },
      { icon: "chart", title: "لما تكبر", text: "مخازن متعددة، فواتير شراء وموردين بمتوسط التكلفة، وحسابات للخزنة والمصاريف والأرباح. تفعلها لما تحتاجها بس.", points: ["مخازن وتحويل وجرد", "موردين وفواتير شراء", "حسابات وأرباح بدون ما تكون محاسب"] },
    ],
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
    subtitle: "أمثلة توضيحية لمتاجر بألوان وقوالب مختلفة.",
    items: [
      { name: "عطور الندى", category: "عطور وعناية", primary: "#2B1B3D", accent: "#C19E58", template: "makhmal", href: "" },
      { name: "شارع 218", category: "ملابس وشباب", primary: "#111111", accent: "#FF5A1F", template: "nabd", href: "" },
      { name: "لمسة", category: "إكسسوارات وهدايا", primary: "#0D263E", accent: "#087C86", template: "naqa", href: "" },
      { name: "بيت الحلا", category: "حلويات وأكل بيتي", primary: "#7A3E12", accent: "#E0A030", template: "hikaya", href: "" },
      { name: "خيط", category: "أزياء وإكسسوارات", primary: "#111111", accent: "#C19E58", template: "lamsa", href: "" },
      { name: "ذهب ليبيا", category: "عطور وذهب", primary: "#12372A", accent: "#D9B65C", template: "makhmal", href: "" },
    ],
  },
  design: {
    title: "نصمم لك ريلز ولوجو وهوية",
    subtitle: "ما نكتفي بالمتجر: فريق رُكن يصمم لك اللي يخلي علامتك تبان احترافية في إنستغرام وتيك توك.",
    button: "ابدأ واطلب تصميمك",
    items: [
      { title: "ريلز لمنتجاتك", text: "فيديوهات قصيرة لإنستغرام وتيك توك تبيّن منتجاتك بشكل يشد الزبون." },
      { title: "لوجو لمتجرك", text: "لوجو يليق بنشاطك، بألوانك وبدون تعقيد." },
      { title: "هوية كاملة", text: "لوجو وألوان وخطوط وشكل موحد لمتجرك وحساباتك." },
      { title: "مجاناً مع الباقة السنوية", text: "ريل أو لوجو مجاني في كل فترة اشتراك سنوي. والسعر للباقي حسب طلبك." },
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
  pricing: {
    title: "أسعار واضحة", subtitle: "جرّب مجاناً أول، وادفع كاش أو تحويل لما تعجبك. كل ما طوّلت المدة، كل ما وفّرت.",
    note: "الدفع يدوي (كاش أو تحويل) والاشتراك يتفعل مباشرة بعد التأكيد.",
    popularBadge: "الأكثر طلباً", compareTitle: "قارن الباقات", compareSubtitle: "كل الميزات في جدول واحد.", rows: {},
  },
  faq: {
    title: "أسئلة شائعة",
    items: [
      { q: "كيف أدفع الاشتراك؟", a: "الدفع كاش أو تحويل مصرفي، تتواصل معانا وبعد الدفع نفعّل اشتراكك فوراً." },
      { q: "شن يصير لما تخلص الفترة التجريبية؟", a: "متجرك يتقفل للزباين واللوحة تبقى للقراءة فقط لين تجدد الاشتراك. بياناتك ما تضيعش." },
      { q: "أقدر أربط دومين خاص بي؟", a: "إيه، الدومين الخاص متاح في الباقة السنوية." },
      { q: "أقدر أغير الباقة بعدين؟", a: "طبعاً، ترقّي في أي وقت وتكمل بدون ما تفقد شي." },
      { q: "هل لازم أعرف برمجة؟", a: "لا خالص. كل شي من اللوحة: المنتجات والتصميم والنصوص بدون كود." },
    ],
  },
  cta: { title: "جاهز تفتح ركنك؟", subtitle: "سجّل الحين وجرّب مجاناً، بدون بطاقة بنكية.", button: "افتح متجرك مجاناً" },
  footer: { text: "رُكن — ركنك في السوق… أونلاين." },
  seo: { title: "رُكن — افتح متجرك الإلكتروني في ليبيا", description: "منصة متاجر إلكترونية ليبية: دفع عند الاستلام، مندوبين، مرتجعات، ومدن ليبيا جاهزة. افتح متجرك مجاناً في دقيقتين." },
};
