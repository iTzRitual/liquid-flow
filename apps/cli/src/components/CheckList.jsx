import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { tfmt } from '@liquidflow/core';
import { windowList } from '../window.js';

const CONFLICT_ACTIONS = ['skip', 'update', 'rename'];

export default function CheckList({ title, items = [], onConfirm, onCancel, t = {}, maxRows = 12 }) {
  const nItems = items.length;
  const [i, setI] = useState(0);

  // Normal rows checked state (default true for non-conflict items)
  const [checkedMap, setCheckedMap] = useState(() => {
    const map = {};
    for (const item of items) {
      if (!item.conflict) map[item.key] = true;
    }
    return map;
  });

  // Conflict rows action state (default 'skip' for conflict items)
  const [actionMap, setActionMap] = useState(() => {
    const map = {};
    for (const item of items) {
      if (item.conflict) map[item.key] = 'skip';
    }
    return map;
  });

  const currentItem = nItems > 0 ? items[i] : null;

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (!nItems) return;

    if (key.upArrow) {
      setI((p) => (p - 1 + nItems) % nItems);
      return;
    }
    if (key.downArrow) {
      setI((p) => (p + 1) % nItems);
      return;
    }

    if (currentItem) {
      if (currentItem.conflict) {
        const curAction = actionMap[currentItem.key] || 'skip';
        const curIdx = CONFLICT_ACTIONS.indexOf(curAction);
        if (key.rightArrow) {
          const next = CONFLICT_ACTIONS[(curIdx + 1) % CONFLICT_ACTIONS.length];
          setActionMap((prev) => ({ ...prev, [currentItem.key]: next }));
          return;
        }
        if (key.leftArrow) {
          const prevAct = CONFLICT_ACTIONS[(curIdx - 1 + CONFLICT_ACTIONS.length) % CONFLICT_ACTIONS.length];
          setActionMap((prev) => ({ ...prev, [currentItem.key]: prevAct }));
          return;
        }
      } else {
        if (input === ' ' || key.space) {
          setCheckedMap((prev) => ({ ...prev, [currentItem.key]: !prev[currentItem.key] }));
          return;
        }
      }

      if (input === 'a' || input === 'A') {
        const normalItems = items.filter((it) => !it.conflict);
        const allChecked = normalItems.every((it) => checkedMap[it.key]);
        const nextMap = { ...checkedMap };
        for (const it of normalItems) {
          nextMap[it.key] = !allChecked;
        }
        setCheckedMap(nextMap);
        return;
      }
    }

    if (key.return) {
      const selections = [];
      for (const item of items) {
        if (item.conflict) {
          const act = actionMap[item.key] || 'skip';
          const selAction = act === 'update' ? 'update' : act === 'rename' ? 'add' : 'skip';
          selections.push({ Name: item.key, action: selAction });
        } else {
          if (checkedMap[item.key] !== false) {
            selections.push({ Name: item.key, action: 'add' });
          }
        }
      }
      onConfirm?.(selections);
    }
  });

  const w = windowList(nItems, i, maxRows);
  const slice = items.slice(w.start, w.start + w.count);

  const getActionLabel = (actKey) => {
    if (actKey === 'update') return t.ShareActionUpdate || 'Update';
    if (actKey === 'rename') return t.ShareActionRename || 'Rename';
    return t.ShareActionSkip || 'Skip';
  };

  const helpText = t.CheckListNav || '↑/↓ wybór · spacja zaznacz · a wszystkie · Enter zatwierdź · Esc anuluj';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{title}</Text>
      {nItems > 0 && (
        <>
          {w.above > 0 && <Text dimColor>{tfmt(t.MoreAbove || '… {count} powyżej', { count: w.above })}</Text>}
          {slice.map((item, k) => {
            const idx = w.start + k;
            const sel = idx === i;
            if (item.conflict) {
              const act = actionMap[item.key] || 'skip';
              const actLabel = getActionLabel(act);
              const existsBadge = t.ShareExistsBadge || 'already exists';
              return (
                <Text key={item.key || idx} color={sel ? 'black' : undefined} backgroundColor={sel ? 'cyan' : undefined} wrap="truncate-end">
                  {sel ? '› ' : '  '}
                  <Text color={sel ? 'black' : 'yellow'}>[!] </Text>
                  {item.label}
                  <Text color={sel ? 'black' : undefined} dimColor={!sel}> ({existsBadge})</Text>
                  <Text color={sel ? 'black' : 'yellow'}> ‹ {actLabel} ›</Text>
                  {item.hint ? <Text color={sel ? 'black' : undefined} dimColor={!sel}>  {item.hint}</Text> : null}
                </Text>
              );
            }

            const isChecked = checkedMap[item.key] !== false;
            return (
              <Text key={item.key || idx} color={sel ? 'black' : undefined} backgroundColor={sel ? 'cyan' : undefined} wrap="truncate-end">
                {sel ? '› ' : '  '}
                [{isChecked ? 'x' : ' '}] {item.label}
                {item.hint ? <Text color={sel ? 'black' : undefined} dimColor={!sel}>  {item.hint}</Text> : null}
              </Text>
            );
          })}
          {w.below > 0 && <Text dimColor>{tfmt(t.MoreBelow || '… {count} poniżej', { count: w.below })}</Text>}
        </>
      )}
      <Text> </Text>
      <Text dimColor>{helpText}</Text>
    </Box>
  );
}
