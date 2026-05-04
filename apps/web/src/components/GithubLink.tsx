import { GithubIcon } from '@/components/icons/GithubIcon';
import { GITHUB_REPO_URL, TITLE } from '@/constants';

interface Props {
  className?: string;
  label?: string;
}

export function GithubLink({ className, label }: Props) {
  return (
    <a
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${TITLE} on GitHub`}
      className={className}
    >
      <GithubIcon aria-hidden="true" className="h-5 w-5" />
      {label}
    </a>
  );
}
