import { Link, useLocation } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { Card, EmptyState } from '../components/ui';

// Any address the app has no page for. It used to render nothing at all — a
// blank screen that looked like a crash (Phase 2 H16).
export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <Card padding="p-0">
      <EmptyState
        icon={MapPinOff}
        title="Page not found"
        hint={`There is no page at ${pathname}. It may have moved, or the link may be mistyped.`}
        action={<Link to="/" className="text-xs font-semibold text-brand-accent hover:underline">Go to the dashboard</Link>}
      />
    </Card>
  );
}
