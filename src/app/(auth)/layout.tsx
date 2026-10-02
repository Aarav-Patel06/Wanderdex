import { PageBackground } from "@/components/page-background";

// Centered single column for /login and /signup; fits a 375px phone.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <PageBackground phone="top" className="inset-x-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)]" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-8">
        {children}
      </main>
    </>
  );
}
