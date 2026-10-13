/** رابط «انتقل للمحتوى»: يظهر بس لما ياخذ التركيز بالكيبورد، ويتخطى القوائم والترويسة (WCAG 2.4.1) */
export function SkipLink() {
  return <a href="#main-content" className="skip-link">انتقل للمحتوى</a>;
}
