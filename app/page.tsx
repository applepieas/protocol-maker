import HeroSection from "@/components/hero-section";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authHref = user ? "/dashboard" : "/login";

  return (
    <main>
      <HeroSection authHref={authHref} />

    </main>
  );
}
