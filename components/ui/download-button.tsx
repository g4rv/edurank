import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * A download link styled as a button.
 *
 * Deliberately a plain `<a download>` and not a client component: the export
 * routes stream a file, so there is nothing to hold in React state and no
 * reason to ship JavaScript for it. The browser's own download handling also
 * keeps working with the middle-click and «save link as» people already use.
 */
export function DownloadButton({
  href,
  label,
  title,
  variant = 'outline',
  size,
}: {
  href: string;
  label: string;
  /** Tooltip — say what the file is when the label has to stay short */
  title?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
}) {
  return (
    <Button asChild variant={variant} size={size} title={title ?? label}>
      <a href={href} download>
        <FileDown className="size-4" />
        {label}
      </a>
    </Button>
  );
}
