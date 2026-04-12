import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6 py-16">
      <SignIn />
    </div>
  );
}
