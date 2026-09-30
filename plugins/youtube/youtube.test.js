import { parseJson3, parseVtt, parseXml } from './youtube.js';

describe('YouTube transcript parsers', () => {
  test('parseJson3 extracts timestamped text', () => {
    const json3 = JSON.stringify({
      events: [
        { tStartMs: 0, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 65000, segs: [{ utf8: 'World' }] },
      ],
    });
    const result = parseJson3(json3);
    expect(result).toBe('[00:00] Hello\n[01:05] World');
  });

  test('parseVtt extracts text from VTT', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello there

00:01:05.000 --> 00:01:09.000
General Kenobi`;
    const result = parseVtt(vtt);
    expect(result).toContain('[00:01] Hello there');
    expect(result).toContain('[01:05] General Kenobi');
  });

  test('parseXml extracts text from XML captions', () => {
    const xml = '<text start="0" dur="3">First line</text><text start="65.5" dur="2">Second line</text>';
    const result = parseXml(xml);
    expect(result).toBe('[00:00] First line\n[01:05] Second line');
  });

  test('parseVtt strips markup without double-decoding entities', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<b>Hello</b> &amp;lt;script&amp;gt; &lt;b&gt;`;
    const result = parseVtt(vtt);
    expect(result).toBe('[00:01] Hello &lt;script&gt; &lt;b&gt;');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('<b>');
  });

  test('parseXml strips markup without reintroducing encoded tags', () => {
    const xml = '<text start="0" dur="3"><b>Hello</b> &amp;lt;script&amp;gt; &lt;b&gt;</text>';
    const result = parseXml(xml);
    expect(result).toBe('[00:00] Hello &lt;script&gt; &lt;b&gt;');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('<b>');
  });

  test('parseJson3 handles empty events', () => {
    expect(parseJson3(JSON.stringify({ events: [] }))).toBe('');
  });

  test('parseJson3 handles malformed JSON', () => {
    expect(parseJson3('not json')).toBeNull();
  });
});
