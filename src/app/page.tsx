import { AuthForm } from "@/components/auth-form";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main>
      <AuthForm searchParams={await searchParams} />
    </main>
  );
}
