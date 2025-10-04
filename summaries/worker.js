/* static/worker.js
   Lightweight table index + search worker.
   - Accepts messages: {type: 'index', tables: [...]} | {type:'index', html: '<html...>'} | {type:'search', query, limit, requestId}
   - Responds with: status, searchResults, searchCanceled, error
   - Non-destructive. No DOM access required. Uses DOMParser when available.
*/

const CHUNK_YIELD = 500; // rows processed before yielding to event loop
let indexStore = { tables: [] }; // each: { id, headers:[], rows:[ [cell,..] ], rowsText:[], rowsTextLc:[] }
let currentSearchToken = 0;

function sanitize(text) {
  return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* Parse HTML string for tables. Uses DOMParser in worker if available, otherwise a safe regex fallback.
   Returns array of { id, headers: [], rows: [[cell,...],...] }.
*/
function parseHtmlTables(html) {
  const out = [];
  try {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const tables = Array.from(doc.querySelectorAll('table'));
      tables.forEach((table, idx) => {
        let headers = Array.from(table.querySelectorAll('thead th')).map(h => h.textContent.trim());
        if (!headers.length) {
          // fallback: try first row as header if it contains th or expected header cells
          const firstRow = table.querySelector('tr');
          if (firstRow) {
            const headerCells = Array.from(firstRow.querySelectorAll('th'));
            if (headerCells.length) headers = headerCells.map(h => h.textContent.trim());
            else {
              // fallback to text of first row cells (may be actual data)
              headers = [];
            }
          }
        }
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
        let rows = [];
        if (bodyRows.length) {
          rows = bodyRows.map(tr => Array.from(tr.cells).map(td => td.textContent.trim()));
        } else {
          // if no tbody, take all tr and skip header row if it's used as header
          const allTr = Array.from(table.querySelectorAll('tr'));
          const start = headers.length ? 1 : 0;
          rows = allTr.slice(start).map(tr => Array.from(tr.cells).map(td => td.textContent.trim()));
        }
        out.push({ id: `table_${idx + 1}`, headers, rows });
      });
    } else {
      // Minimal safe fallback: regex-based table parsing (best-effort)
      const tableMatches = [...html.matchAll(/<table[\s\S]*?>([\s\S]*?)<\/table>/gi)];
      tableMatches.forEach((m, idx) => {
        const inner = m[1];
        let headers = [];
        const theadMatch = inner.match(/<thead[\s\S]*?>([\s\S]*?)<\/thead>/i);
        if (theadMatch) {
          const ths = [...theadMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(a => a[1].replace(/<[^>]+>/g, '').trim());
          headers = ths;
        } else {
          const firstTrMatch = inner.match(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/i);
          if (firstTrMatch) {
            const ths = [...firstTrMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(a => a[1].replace(/<[^>]+>/g, '').trim());
            headers = ths;
          }
        }
        const rowMatches = [...inner.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi)];
        const rows = rowMatches.map(rm => [...rm[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(a => a[1].replace(/<[^>]+>/g, '').trim()));
        const bodyRows = headers.length && rows.length && arraysEqual(headers, rows[0]) ? rows.slice(1) : rows;
        out.push({ id: `table_${idx + 1}`, headers, rows: bodyRows });
      });
    }
  } catch (err) {
    postMessage({ type: 'error', error: 'parse_html_failed', details: String(err) });
  }
  return out;
}

function addTableToIndex(id, headers, rows) {
  const normalizedRows = rows.map(r => (Array.isArray(r) ? r.map(c => String(c)) : [String(r)]));
  const rowsText = normalizedRows.map(r => r.join(' | '));
  const rowsTextLc = rowsText.map(s => sanitize(s));
  indexStore.tables.push({ id: id || `table_${indexStore.tables.length + 1}`, headers: headers ? headers.slice() : [], rows: normalizedRows, rowsText, rowsTextLc });
}

/* Build index from either:
   - msg.tables : array of {id, headers, rows}
   - msg.html   : html string containing tables
   - msg.url    : fetchable url (will fetch then parse)
*/
async function buildIndex(msg = {}) {
  indexStore.tables = [];
  if (Array.isArray(msg.tables) && msg.tables.length) {
    for (let t of msg.tables) {
      const id = t.id || null;
      const headers = Array.isArray(t.headers) ? t.headers.map(h => String(h)) : [];
      const rows = Array.isArray(t.rows) ? t.rows : [];
      addTableToIndex(id, headers, rows);
    }
    postMessage({ type: 'status', status: 'indexed', tables: indexStore.tables.length });
    return;
  }

  if (typeof msg.html === 'string' && msg.html.length) {
    const parsed = parseHtmlTables(msg.html);
    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      addTableToIndex(p.id || `table_${i + 1}`, p.headers || [], p.rows || []);
    }
    postMessage({ type: 'status', status: 'indexed', tables: indexStore.tables.length });
    return;
  }

  if (typeof msg.url === 'string' && msg.url.length) {
    try {
      const res = await fetch(msg.url);
      const html = await res.text();
      const parsed = parseHtmlTables(html);
      for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];
        addTableToIndex(p.id || `table_${i + 1}`, p.headers || [], p.rows || []);
      }
      postMessage({ type: 'status', status: 'indexed', tables: indexStore.tables.length });
      return;
    } catch (err) {
      postMessage({ type: 'error', error: 'fetch_failed', details: String(err) });
      return;
    }
  }

  // nothing to index
  postMessage({ type: 'status', status: 'indexed', tables: indexStore.tables.length });
}

/* Perform search across indexed tables.
   Supports cancellation if a newer search arrives.
*/
async function handleSearch(msg = {}) {
  const token = ++currentSearchToken;
  const query = (msg.query || '').trim();
  const requestId = msg.requestId || null;
  const perTableLimit = Number.isFinite(msg.limit) ? Math.max(1, msg.limit) : 200;

  if (!query) {
    postMessage({ type: 'searchResults', query, results: [], requestId });
    return;
  }
  const q = sanitize(query);
  const results = [];

  for (let tIndex = 0; tIndex < indexStore.tables.length; tIndex++) {
    if (token !== currentSearchToken) {
      postMessage({ type: 'searchCanceled', requestId });
      return;
    }
    const table = indexStore.tables[tIndex];
    const matched = [];
    const snippets = [];
    const rowsLc = table.rowsTextLc || [];
    for (let i = 0; i < rowsLc.length; i++) {
      if (rowsLc[i].indexOf(q) !== -1) {
        matched.push(i);
        if (snippets.length < perTableLimit) {
          const full = table.rowsText[i] || '';
          const pos = rowsLc[i].indexOf(q);
          const start = Math.max(0, pos - 40);
          const snippet = full.substring(start, Math.min(full.length, start + 160));
          snippets.push({ rowIndex: i, snippet });
        }
      }
      // yield occasionally for very large tables
      if (i % CHUNK_YIELD === 0) await new Promise(r => setTimeout(r, 0));
      if (token !== currentSearchToken) {
        postMessage({ type: 'searchCanceled', requestId });
        return;
      }
    }
    if (matched.length) results.push({ tableId: table.id, tableIndex: tIndex, matches: matched, snippets });
  }

  postMessage({ type: 'searchResults', query: msg.query, results, requestId });
}

self.addEventListener('message', async (ev) => {
  const msg = ev.data || {};
  try {
    switch (msg.type) {
      case 'index':
        await buildIndex(msg);
        break;
      case 'search':
        // handleSearch is async but we don't await to allow cancellation token updates
        handleSearch(msg).catch(err => postMessage({ type: 'error', error: 'search_error', details: String(err) }));
        break;
      case 'clear':
        indexStore = { tables: [] };
        postMessage({ type: 'status', status: 'cleared' });
        break;
      case 'status':
        postMessage({ type: 'status', status: 'ready', tables: indexStore.tables.length });
        break;
      case 'ping':
        postMessage({ type: 'pong' });
        break;
      default:
        postMessage({ type: 'error', error: 'unknown_message_type', received: msg.type });
    }
  } catch (err) {
    postMessage({ type: 'error', error: String(err), stack: err && err.stack });
  }
});
