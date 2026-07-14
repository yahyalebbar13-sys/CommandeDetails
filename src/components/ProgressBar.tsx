'use client';

import { AppProgressBar as NProgressBar } from 'next-nprogress-bar';

export default function ProgressBar() {
  return (
    <NProgressBar
      height="4px"
      color="#C8102E"
      options={{ showSpinner: false }}
      shallowRouting
    />
  );
}
