import React from 'react';
import { render } from 'ink';
import App from './App.jsx';

// Czyść ekran przy starcie, by banner i panel były na górze terminala.
process.stdout.write('\x1b[2J\x1b[H');

const { waitUntilExit } = render(<App />);
await waitUntilExit();
