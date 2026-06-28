import React from 'react';
import { readFileSync } from 'node:fs';
import { Box, Text } from 'ink';

// Wersja z package.json CLI (jedyne źródło prawdy — bump w package.json wystarcza,
// brak ręcznie utrzymywanego literału).
const APP_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

// Nagłówek po prawej od logo. Pokazujemy tylko to, co istnieje:
//  - niepołączony       -> '~'
//  - połączony          -> Sklep
//  - po wyborze szablonu-> Szablon
//  - Git tylko gdy aktywny
// Konflikty NIE są tutaj — App.jsx przypina je do dołu kolumny nagłówka
// (puste pole obok logo), żeby ich pojawienie się nie spychało układu.
export default function StatusBar({ state, git, t }) {
  const shop = state?.currentShop;
  const tpl = state?.currentTemplate;

  // Etykiety statusu (Sklep/Szablon/Git) wyrównane do wspólnej szerokości —
  // liczonej z długości przetłumaczonych słów, by kolumna wartości była równa
  // w obu językach.
  const labelW = Math.max(t.ShopLabel.length, t.TemplateLabel.length, t.GitLabel.length) + 1;
  const pad = (s) => s.padEnd(labelW);

  // Każdy wiersz to pojedynczy <Text wrap="truncate-end"> — przy wąskim oknie
  // przycina się jako całość zamiast łamać etykiety/dokładać puste linie.
  return (
    <Box flexDirection="column">
      <Text color="#4da3ff" bold wrap="truncate-end">Liquid Flow CLI {APP_VERSION}</Text>

      {shop
        ? <Text wrap="truncate-end"><Text color="gray">{pad(t.ShopLabel)}</Text><Text color="green">● {shop.Name}</Text><Text color="gray">  {shop.Url}</Text></Text>
        : <Text color="gray">~</Text>}

      {tpl && (
        <Text wrap="truncate-end"><Text color="gray">{pad(t.TemplateLabel)}</Text><Text color="cyan">{tpl.Name}</Text><Text color="gray"> [{tpl.Id}]</Text></Text>
      )}

      {git?.active && (
        <Text wrap="truncate-end">
          <Text color="gray">{pad(t.GitLabel)}</Text>
          {git.autoCommit ? <Text color="green">commit ✓ </Text> : <Text color="gray">commit ✗ </Text>}
          {git.autoPush ? <Text color="green">push ✓</Text> : <Text color="gray">push ✗</Text>}
        </Text>
      )}
    </Box>
  );
}
