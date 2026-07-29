import { AuthForm } from "@/components/auth-form";
import { readRuntimePolicy } from "@/lib/auth/runtime-policy";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const policy = readRuntimePolicy();

  return (
    <main>
      <AuthForm
        allowSignUp={policy.mode === "local"}
        searchParams={await searchParams}
      />
    </main>
  );
}
