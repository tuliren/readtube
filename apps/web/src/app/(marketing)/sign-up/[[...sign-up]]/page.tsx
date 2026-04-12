import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6 py-16">
      <SignUp />
    </div>
  );
}
