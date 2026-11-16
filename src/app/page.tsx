import { AuthForm } from "@/components/auth-form";
import { LegalLinks } from "@/components/legal/legal-page";
import { readRuntimePolicy } from "@/lib/auth/runtime-policy";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string; error?: string; next?: string }>;
}) {
  const policy = readRuntimePolicy();
  const params = await searchParams;

  return (
    <main className="auth-page">
      <AuthForm
        allowSignUp={policy.mode === "local"}
        searchParams={{
          confirmed: params.auth === "confirmed",
          passwordChanged: params.auth === "password-changed",
          accountDeleted: params.auth === "deleted",
          error: params.error,
          next: params.next,
        }}
      />
      {/* Readable before signing in, at the foot of the screen (owner, 15 Nov
          2026). */}
      <LegalLinks variant="footer" />
    </main>
  );
}
