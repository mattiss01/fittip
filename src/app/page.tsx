import { AuthForm } from "@/components/auth-form";
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
    <main>
      <AuthForm
        allowSignUp={policy.mode === "local"}
        searchParams={{
          confirmed: params.auth === "confirmed",
          passwordChanged: params.auth === "password-changed",
          error: params.error,
          next: params.next,
        }}
      />
    </main>
  );
}
