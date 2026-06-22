import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import TextInput from 'ink-text-input';

// Sekwencyjny formularz. fields: [{ name, label, mask?, initial?, optional? }].
// Enter zatwierdza pole i przechodzi dalej; po ostatnim wywołuje onSubmit(values).
// Esc anuluje cały formularz.
export default function Form({ title, fields, onSubmit, onCancel }) {
  const [idx, setIdx] = useState(0);
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.initial || ''])));
  const [cur, setCur] = useState(fields[0]?.initial || '');

  useInput((input, key) => { if (key.escape) onCancel?.(); });

  const f = fields[idx];

  const submitField = (val) => {
    const v = val ?? '';
    if (!v && !f.optional) return; // wymagane pole — nie idź dalej
    const next = { ...values, [f.name]: v };
    setValues(next);
    if (idx + 1 < fields.length) {
      setIdx(idx + 1);
      setCur(fields[idx + 1].initial || '');
    } else {
      onSubmit?.(next);
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text color="magenta" bold>{title}</Text>
      {fields.map((ff, j) => (
        <Box key={ff.name}>
          <Text color={j === idx ? 'white' : 'gray'}>{j < idx ? '✓ ' : j === idx ? '› ' : '  '}{ff.label}: </Text>
          {j < idx
            ? <Text color="gray">{ff.mask ? '••••' : values[ff.name] || <Text dimColor>(puste)</Text>}</Text>
            : j === idx
              ? <TextInput value={cur} onChange={setCur} onSubmit={submitField} mask={ff.mask} placeholder={ff.optional ? '(opcjonalne)' : ''} />
              : <Text color="gray" dimColor>…</Text>}
        </Box>
      ))}
      <Text color="gray" dimColor>Enter dalej · Esc anuluj</Text>
    </Box>
  );
}
