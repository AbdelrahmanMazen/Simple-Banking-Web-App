"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { destroySession, signIn, signUp, verifyEmailCode } from "@/lib/auth";

const signupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(6).max(80),
});

const signinSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(6).max(80),
});

export async function signupAction(formData: FormData) {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return;

  const user = await signUp(parsed.data.email, parsed.data.name, parsed.data.password);
  if (!user) return;

  revalidatePath("/");
  redirect(`/verify?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function signinAction(formData: FormData) {
  const parsed = signinSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return;

  const user = await signIn(parsed.data.email, parsed.data.password);
  if (!user) return;

  revalidatePath("/");
  if (!user.isVerified) {
    redirect(`/verify?email=${encodeURIComponent(parsed.data.email)}`);
  }
}

export async function signoutAction() {
  await destroySession();
  revalidatePath("/");
}

export async function verifyAction(formData: FormData) {
  const parsed = z
    .object({
      email: z.string().trim().email().toLowerCase(),
      code: z.string().trim().min(4).max(6),
    })
    .safeParse({
      email: formData.get("email"),
      code: formData.get("code"),
    });

  if (!parsed.success) return;

  const ok = await verifyEmailCode(parsed.data.email, parsed.data.code);
  revalidatePath("/");

  redirect(ok ? "/dashboard" : `/verify?email=${encodeURIComponent(parsed.data.email)}&error=Invalid%20or%20expired%20code`);
}
