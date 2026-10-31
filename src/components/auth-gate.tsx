import * as React from "react";
import { ClerkProvider, Show, SignIn, useClerk, useUser } from "@clerk/react";
import { CLERK_KEY, authEnabled } from "@/lib/auth";
import { setStorageUser, wipeUserData } from "@/lib/storage";

const appearance = {
  variables: { colorPrimary: "#2e9a58", borderRadius: "0.75rem", fontFamily: "inherit" },
  elements: { rootBox: "w-full", card: "shadow-card" },
};

/** Gives each account its own browser storage, then shows the app. Runs only once someone is signed in. */
function SignedInApp({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const clerk = useClerk();
  const id = user?.id;
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    setStorageUser({
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? "",
      name: user.fullName ?? undefined,
      picture: user.imageUrl,
    });
    setReady(true);
  }, [user]);

  // If the session ends while the app is open (sign-out, expiry), clear what this account saved here and reload.
  React.useEffect(() => {
    if (!id) return;
    return clerk.addListener(({ user: u }) => {
      if (!u) {
        wipeUserData(id);
        window.location.reload();
      }
    });
  }, [id, clerk]);

  return ready ? <>{children}</> : null;
}

function SignInScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-emblem.png" alt="" width={56} height={56} className="size-14" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-logo-green">CashPilot</h1>
            <p className="text-xs font-bold uppercase tracking-wider text-logo-blue">Your money. Your next move.</p>
          </div>
        </div>
        <SignIn routing="hash" appearance={appearance} />
      </div>
    </main>
  );
}

function NotConfigured() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="max-w-md rounded-[32px] bg-white p-8 text-center shadow-card">
        <h1 className="text-xl font-bold text-ink">Sign-in isn't set up yet</h1>
        <p className="mt-2 text-sm font-medium text-gray-500">
          This site is closed until sign-in is configured. The owner needs to set VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY and redeploy.
        </p>
      </div>
    </main>
  );
}

/** Shows Clerk's sign-in until someone is signed in. With no key set it opens directly in development only; a production build is closed. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  if (!authEnabled) {
    const allowed = !import.meta.env.PROD || import.meta.env.VITE_ALLOW_NO_AUTH === "true";
    return allowed ? <>{children}</> : <NotConfigured />;
  }
  return (
    <ClerkProvider publishableKey={CLERK_KEY} appearance={appearance}>
      <Show when="signed-out">
        <SignInScreen />
      </Show>
      <Show when="signed-in">
        <SignedInApp>{children}</SignedInApp>
      </Show>
    </ClerkProvider>
  );
}
