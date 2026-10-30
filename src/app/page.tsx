"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  useEffect(() => {
    router.replace(user ? "/dashboard" : "/login");
  }, [router, user]);
  return null;
}
