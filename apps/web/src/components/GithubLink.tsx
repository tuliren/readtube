import { GithubIcon } from '@/components/icons/GithubIcon';
import { GITHUB_REPO_URL, TITLE } from '@/constants';

interface Props {
  className?: string;
  label?: string;
  onClick?: () => void;
}

export function GithubLink({ className, label, onClick }: Props) {
  return (
    <a
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${TITLE} on GitHub`}
      className={className}
      onClick={onClick}
    >
      <GithubIcon aria-hidden="true" className="h-5 w-5" />
      {label}
    </a>
  );
}
