"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor } from "@/lib/permissions";
import { useSession } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  useEffect(() => {
    router.replace(user ? homeFor(user.role) : "/login");
  }, [router, user]);
  return null;
}
