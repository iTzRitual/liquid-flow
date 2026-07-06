import React from 'react';
import { Box, Text } from 'ink';
import Spinner from './Spinner.jsx';

const BAR_WIDTH = 24;

function bar(done, total) {
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const filled = Math.round(pct * BAR_WIDTH);
  return { filled: '█'.repeat(filled), empty: '░'.repeat(BAR_WIDTH - filled), pct: Math.round(pct * 100) };
}

// A live sync-startup loader: a spinner + (for downloads) a 0-100% bar.
export default function ProgressView({ progress }) {
  if (!progress) return null;
  const { kind, label, done, total, indeterminate } = progress;
  const showBar = kind === 'download' && !indeterminate && total > 0;
  const b = showBar ? bar(done, total) : null;

  return (
    <Box paddingX={1}>
      <Spinner color="#82bbff" />
      <Text wrap="truncate-end"> {label}</Text>
      {showBar && (
        <Text>
          <Text color="gray">  [</Text>
          <Text color="#82bbff">{b.filled}</Text>
          <Text color="gray">{b.empty}]  </Text>
          <Text color="#82bbff">{b.pct}%</Text>
          <Text color="gray">  {done}/{total}</Text>
        </Text>
      )}
    </Box>
  );
}
