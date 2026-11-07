import { Suspense } from "react";
import type { Metadata } from "next";
import { FrontDoor } from "@/components/console/FrontDoor";

export const metadata: Metadata = { title: "Sign in" };

export default function SignIn() {
  return (
    <Suspense>
      <FrontDoor mode="signin" />
    </Suspense>
  );
}
