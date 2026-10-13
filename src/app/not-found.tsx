import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <Logo />
      <h1 className="text-2xl">الصفحة هذي ما لقيناهاش</h1>
      <p className="text-muted">يمكن الرابط غلط أو الصفحة اتنقلت.</p>
      <ButtonLink href="/">الرئيسية</ButtonLink>
    </main>
  );
}
