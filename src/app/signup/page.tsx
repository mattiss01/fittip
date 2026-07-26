import { AuthForm } from "@/components/auth-form";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ "check-email"?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main>
      <AuthForm
        initialMode="sign-up"
        searchParams={{
          checkEmail: params["check-email"] === "1",
          error: params.error,
        }}
      />
    </main>
  );
}
