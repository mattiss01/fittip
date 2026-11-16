import { AuthForm } from "@/components/auth-form";
import { LegalLinks } from "@/components/legal/legal-page";
import { readRuntimePolicy } from "@/lib/auth/runtime-policy";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ "check-email"?: string; error?: string }>;
}) {
  if (readRuntimePolicy().mode === "founder-staging") {
    redirect("/");
  }

  const params = await searchParams;
  return (
    <main className="auth-page">
      <AuthForm
        initialMode="sign-up"
        searchParams={{
          checkEmail: params["check-email"] === "1",
          error: params.error,
        }}
      />
      {/* Readable before signing in, at the foot of the screen (owner, 15 Nov
          2026). */}
      <LegalLinks variant="footer" />
    </main>
  );
}
