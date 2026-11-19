'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={reset}>
          Retry
        </Button>
      }
    >
      <AlertTitle>Could not load usage data</AlertTitle>
      {error.message}
    </Alert>
  );
}
