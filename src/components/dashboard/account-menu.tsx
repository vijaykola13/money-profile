import { UserButton } from "@clerk/react";
import { authEnabled } from "@/lib/auth";

/** Header control: the signed-in account with Clerk's menu (manage account, sign out). Hidden when sign-in is off. */
export function AccountMenu() {
  if (!authEnabled) return null;
  return <UserButton appearance={{ elements: { avatarBox: "size-9" } }} />;
}
