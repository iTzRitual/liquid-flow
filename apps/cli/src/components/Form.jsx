import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

// A sequential form. Fields:
//   text:   { name, label, mask?, initial?, optional? }
//   choice: { name, label, type:'choice', initial?, options:[{label,value}] }
// Enter confirms the field and moves on; after the last one it calls onSubmit(values).
// In a choice field, ←/→ (or ↑/↓) arrows change the option. Esc cancels the form.
export default function Form({ title, fields, onSubmit, onCancel, t }) {
  const initialValue = (f) =>
    f.initial !== undefined ? f.initial : (f.type === 'choice' ? f.options?.[0]?.value : '');

  const [idx, setIdx] = useState(0);
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.name, initialValue(f)])));
  const [cur, setCur] = useState(() => {
    const v = initialValue(fields[0]);
    return typeof v === 'string' ? v : '';
  });

  const f = fields[idx];

  const advance = (val) => {
    const next = { ...values, [f.name]: val };
    setValues(next);
    if (idx + 1 < fields.length) {
      const nf = fields[idx + 1];
      setIdx(idx + 1);
      const nv = initialValue(nf);
      setCur(typeof nv === 'string' ? nv : '');
    } else {
      onSubmit?.(next);
    }
  };

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (f.type !== 'choice') return; // text fields are handled by TextInput
    const opts = f.options;
    const i = Math.max(0, opts.findIndex((o) => o.value === values[f.name]));
    if (key.leftArrow || key.upArrow) {
      setValues((v) => ({ ...v, [f.name]: opts[(i - 1 + opts.length) % opts.length].value }));
    } else if (key.rightArrow || key.downArrow) {
      setValues((v) => ({ ...v, [f.name]: opts[(i + 1) % opts.length].value }));
    } else if (key.return) {
      advance(values[f.name]);
    }
  });

  const submitText = (val) => {
    const v = val ?? '';
    if (!v && !f.optional) return; // required field — do not advance
    advance(v);
  };

  const renderValue = (ff) => {
    if (ff.type === 'choice') {
      const opt = ff.options.find((o) => o.value === values[ff.name]);
      return <Text color="gray">{opt ? opt.label : ''}</Text>;
    }
    if (ff.mask) return <Text color="gray">••••</Text>;
    return <Text color="gray">{values[ff.name] || <Text dimColor>{t.Empty}</Text>}</Text>;
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text color="magenta" bold>{title}</Text>
      {fields.map((ff, j) => (
        <Box key={ff.name}>
          <Text color={j === idx ? undefined : 'gray'} bold={j === idx}>
            {j < idx ? '✓ ' : j === idx ? '› ' : '  '}{ff.label}: </Text>
          {j < idx
            ? renderValue(ff)
            : j === idx
              ? (ff.type === 'choice'
                  ? <Box>
                      {ff.options.map((o) => {
                        const sel = values[ff.name] === o.value;
                        return (
                          <Text key={String(o.value)} color={sel ? 'black' : 'gray'} backgroundColor={sel ? 'cyan' : undefined}>
                            {' '}{o.label}{' '}
                          </Text>
                        );
                      })}
                    </Box>
                  : <TextInput value={cur} onChange={setCur} onSubmit={submitText} mask={ff.mask} placeholder={ff.optional ? t.Optional : ''} />)
              : <Text dimColor>…</Text>}
        </Box>
      ))}
      <Text dimColor>
        {(f.type === 'choice' ? [t.FormChoiceNav, t.FormNext, t.FormCancel] : [t.FormNext, t.FormCancel]).join(' · ')}
      </Text>
    </Box>
  );
}
