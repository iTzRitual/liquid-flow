import { describe, it, expect } from 'vitest';
import { escapeXml, parseXml, find, findAll, findDeep, localName, text } from './xml.js';

describe('escapeXml', () => {
  it('escapuje wszystkie pięć encji XML', () => {
    expect(escapeXml(`<a href="x" id='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; id=&apos;y&apos;&gt;&amp;'
    );
  });
  it('null/undefined → pusty string', () => {
    expect(escapeXml(null)).toBe('');
    expect(escapeXml(undefined)).toBe('');
  });
  it('liczby są rzutowane na string', () => {
    expect(escapeXml(42)).toBe('42');
  });
});

describe('parseXml', () => {
  it('buduje drzewo z zagnieżdżeniem i tekstem', () => {
    const root = parseXml('<a><b>hi</b><b>yo</b></a>');
    const a = find(root, 'a');
    expect(a).not.toBeNull();
    const bs = findAll(a, 'b');
    expect(bs.map((n) => text(n))).toEqual(['hi', 'yo']);
  });

  it('ignoruje deklarację XML i komentarze', () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><a>x</a>');
    expect(text(find(root, 'a'))).toBe('x');
  });

  it('obsługuje tagi samozamykające', () => {
    const root = parseXml('<a><br/><c>z</c></a>');
    const a = find(root, 'a');
    expect(findAll(a, 'br')).toHaveLength(1);
    expect(text(find(a, 'c'))).toBe('z');
  });

  it('parsuje atrybuty z odkodowaniem encji', () => {
    const root = parseXml('<a x="1&amp;2"/>');
    expect(find(root, 'a').attrs.x).toBe('1&2');
  });

  it('dekoduje encje w tekście (w tym numeryczne)', () => {
    const root = parseXml('<a>&lt;b&gt; &amp; &#65; &#x42;</a>');
    expect(text(find(root, 'a'))).toBe('<b> & A B');
  });
});

describe('nawigacja po drzewie', () => {
  const root = parseXml('<soap:Body><ns:Result><Id>7</Id></ns:Result></soap:Body>');

  it('localName ignoruje prefiks namespace', () => {
    expect(localName('soap:Body')).toBe('Body');
    expect(localName('Plain')).toBe('Plain');
  });

  it('find/findAll dopasowują po lokalnej nazwie (bez prefiksu)', () => {
    const body = find(root, 'Body');
    expect(body).not.toBeNull();
    expect(find(body, 'Result')).not.toBeNull();
  });

  it('findDeep znajduje węzeł w głębi poddrzewa', () => {
    expect(text(findDeep(root, 'Id'))).toBe('7');
    expect(findDeep(root, 'Nieistnieje')).toBeNull();
  });

  it('text() na braku węzła zwraca pusty string', () => {
    expect(text(null)).toBe('');
  });
});
