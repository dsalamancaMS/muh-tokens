import Alert from '@mui/material/Alert';
import RouterLink from '@/components/RouterLink';

export default function NotFound() {
  return (
    <Alert severity="warning">
      No usage was recorded for this session.{' '}
      <RouterLink href="/sessions">
        Back to sessions
      </RouterLink>
    </Alert>
  );
}
