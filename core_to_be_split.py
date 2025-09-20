# core.chunk1.py -- Imports + globals (replace top of core.py with this block)
from __future__ import annotations
import os
import time
import json
import gzip
import shutil
import logging
import html
import re
from pathlib import Path
from typing import Iterable, Callable, Optional, Any, List, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

# Optional project types. Preserve original signatures if available.
try:
    from .types import RenderConfig, RenderResult, TableLike
except Exception:
    class RenderConfig:
        def __init__(self):
            self.log_level = logging.INFO
            self.assets_dir = None
            self.assets_source_dir = None
            self.embed_assets = False
            self.bundle_assets = True
            self.cache_size = 100
            self.table_render_timeout_ms = 500
            self.split_threshold = 0
            self.max_workers = 4
            self.table_row_limit = 0
            self.cancel_event = None
            self.progress_callback = None
            self.gzip_out = False
            # optional: page_title for <title>
            self.page_title = None

    RenderResult = dict
    TableLike = Any

# IO helpers (may be provided by package). Keep fallbacks as None.
_atomic_write = None
_atomic_stream_write = None
_ensure_dir = None
_unique_frag_dir = None
_generate_readme = None
try:
    from .io_utils import _atomic_write, _atomic_stream_write, _ensure_dir, _unique_frag_dir, _generate_readme
except Exception:
    _atomic_write = None
    _atomic_stream_write = None
    _ensure_dir = None
    _unique_frag_dir = None
    _generate_readme = None

# Asset helpers and embedded defaults
copy_assets = None
write_overrides_css = None
_EMBED_STYLE = ""
_EMBED_SCRIPT = ""
try:
    from .assets import copy_assets, write_overrides_css, _EMBED_STYLE, _EMBED_SCRIPT
except Exception:
    copy_assets = None
    write_overrides_css = None
    _EMBED_STYLE = ""
    _EMBED_SCRIPT = ""

# Sanitization helpers. Provide minimal safe fallbacks.
try:
    from .sanitize import _sanitize_output_path, _sanitize_html_whitelist, _sanitize_id
except Exception:
    def _sanitize_output_path(x):
        try:
            return str(x)
        except Exception:
            return x

    def _sanitize_html_whitelist(s: str) -> str:
        # conservative default: return original string (caller should escape when needed)
        try:
            return s
        except Exception:
            return ""

    def _sanitize_id(x, idx=None):
        try:
            s = re.sub(r'[^a-zA-Z0-9\-_]+', '-', str(x).strip().lower())
            s = re.sub(r'-{2,}', '-', s).strip('-')
            if not s:
                s = f"id-{idx or 0}"
            return s
        except Exception:
            return f"id-{idx or 0}"

# Markdown renderer wrapper fallback
try:
    from .markdown import MarkdownRenderer
except Exception:
    class MarkdownRenderer:
        def __init__(self, func: Callable[[str], str], cache_size: int = 100, timeout_s: float = 0.5):
            self.render = func

# Conversion utilities fallback (used by render pipeline)
try:
    from .convert import (
        convert_bullets_to_ul,
        _normalize_list_markers,
        _unescape_brackets_outside_code,
        _detect_column_types,
        _take_and_stream,
        render_table as convert_render_table,
    )
except Exception:
    def convert_bullets_to_ul(x): return x
    def _normalize_list_markers(x): return x
    def _unescape_brackets_outside_code(x): return x
    def _detect_column_types(rows, cols): return ["text"] * len(cols)
    def _take_and_stream(rows_iterable, n): return ([], iter([]))
    convert_render_table = None

# logger
logger = logging.getLogger("render.core")
# library code should not force global basicConfig in all contexts, but keep a sane default.
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# small safe utilities used by the top-level rendering flow
def _default_write_atomic(path: Path, writer: Callable[[Any], None]) -> None:
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        writer(f)
    os.replace(tmp, str(path))

def _ensure_dir_path(p: Path) -> None:
    try:
        p.mkdir(parents=True, exist_ok=True)
    except Exception:
        os.makedirs(str(p), exist_ok=True)

def _is_valid_file(p: Path) -> bool:
    try:
        return p is not None and Path(p).exists() and Path(p).is_file() and (Path(p).stat().st_size > 0)
    except Exception:
        return False
# core.chunk2.py -- Core classes, containers, and small utilities (insert after imports/globals)
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Union, Iterable

# Reuse RenderConfig, RenderResult, TableLike from chunk1 context.
# Provide a few thin dataclasses used by renderer internals to keep structure explicit.

@dataclass
class FragmentInfo:
    """Metadata about a rendered fragment file."""
    idx: int
    path: Path
    line_count: int = 0
    title_id: str = ""
    title_text: str = ""
    sections: List[Tuple[str, str]] = field(default_factory=list)
    warnings: List[Dict[str, Any]] = field(default_factory=list)

@dataclass
class RenderStats:
    """Summary statistics produced by render_html."""
    tables: int = 0
    rows: int = 0
    runtime_ms: int = 0
    warnings: List[Dict[str, Any]] = field(default_factory=list)
    output: Optional[str] = None

# Lightweight helper for safe JSON dumps used in templates
def _safe_json_dumps(obj: Any) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        try:
            return json.dumps(str(obj))
        except Exception:
            return 'null'

# Path related helpers
def _safe_relpath(target: Union[str, Path], start: Union[str, Path]) -> str:
    """
    Compute a relative path in a robust way. Falls back to a simple basename on failure.
    Returns a posix-style path.
    """
    try:
        rp = os.path.relpath(str(target), start=str(start))
        return Path(rp).as_posix()
    except Exception:
        try:
            return Path(str(target)).name
        except Exception:
            return "assets"

# Conservative html attribute escaper for small tokens (not whole fragments)
def _attr_escape(value: Any) -> str:
    """
    Escape a value to safely include in double-quoted HTML attributes.
    Keeps short and simple.
    """
    try:
        s = str(value)
        # minimal replace for common dangerous characters
        s = s.replace('&', '&amp;').replace('"', '&quot;').replace("'", "&#x27;").replace("<", '&lt;').replace(">", '&gt;')
        return s
    except Exception:
        return ""

# Small guard for strings used as element ids
def _normalize_id_token(token: Any, fallback_index: Union[int, str] = 0) -> str:
    try:
        t = str(token)
        t = re.sub(r'[^A-Za-z0-9_\-:.]', '-', t).strip('-')
        if not t:
            return f"id-{fallback_index}"
        return t
    except Exception:
        return f"id-{fallback_index}"

# Simple file writer helper that tries atomic then fallback
def _write_atomic_fallback(path: Path, text: str) -> None:
    try:
        if _atomic_write:
            _atomic_write(path, lambda f: f.write(text))
            return
    except Exception:
        pass
    try:
        tmp = str(path) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, str(path))
    except Exception:
        # final fallback
        with open(str(path), "w", encoding="utf-8") as f:
            f.write(text)

# Small validator for an HTML fragment to help detect totally broken pieces
def _looks_like_table_fragment(content: str) -> bool:
    try:
        if not content or not isinstance(content, str):
            return False
        if "<table" in content.lower() and "<tbody" in content.lower():
            return True
        return False
    except Exception:
        return False

# Default CSS variable value provider (used when writing <head>)
def _default_main_header_height() -> int:
    # conservative default in px for header sticky offset
    return 56

# A utility that formats a safe caption string for insertion into HTML
def _safe_caption(text: Any) -> str:
    try:
        s = str(text)
        s = s.strip()
        if not s:
            return ""
        # remove tags if any still present
        s = re.sub(r'<[^>]+>', '', s)
        return html.escape(s)
    except Exception:
        return ""

# Expose a small public helper used by tests or other modules
__all__ = [
    "FragmentInfo",
    "RenderStats",
    "_safe_json_dumps",
    "_safe_relpath",
    "_attr_escape",
    "_normalize_id_token",
    "_write_atomic_fallback",
    "_looks_like_table_fragment",
    "_default_main_header_height",
    "_safe_caption",
]
# core.chunk3.py -- Renderer helpers: head building, <title>, caption defaults, sticky header HTML
from typing import Tuple

def _sri_attr(url: str, cdn_integrity: Optional[Dict[str, str]] = None) -> str:
    """
    Small helper to return SRI attributes if provided.
    """
    try:
        if cdn_integrity and url in cdn_integrity:
            return f' integrity="{cdn_integrity[url]}" crossorigin="anonymous"'
    except Exception:
        pass
    return ""

def _compute_page_title(cfg: RenderConfig, out_path: Path) -> str:
    """
    Determine the page title from cfg.page_title or fallback to filename stem.
    Returns an already-escaped string for safe insertion.
    """
    try:
        title = getattr(cfg, "page_title", None) or (out_path.stem if out_path and hasattr(out_path, "stem") else None) or "Tables Viewer"
        return html.escape(str(title))
    except Exception:
        return html.escape("Tables Viewer")

def _read_asset_text(assets_dir: Path, filename: str, fallback: str = "") -> str:
    """
    Read asset content if available, otherwise return fallback.
    Safe and quiet on errors.
    """
    try:
        p = assets_dir / filename
        if _is_valid_file(p):
            return p.read_text(encoding="utf-8")
    except Exception:
        pass
    return fallback or ""

def _build_head_parts(
    out_path: Path,
    assets_dir: Path,
    cfg: RenderConfig,
    *,
    embed_assets: bool = False,
    style_fallback: str = "",
    cdn_integrity: Optional[Dict[str, str]] = None
) -> Tuple[List[str], str, str]:
    """
    Build the <head> pieces and initial body open for the rendered page.

    Returns (head_parts, page_title_escaped, href_prefix)
    - head_parts: list[str] of HTML fragments to be written at file head
    - page_title_escaped: escaped page title (str)
    - href_prefix: relative href prefix to assets (posix string)
    """
    head_parts: List[str] = []
    page_title_esc = _compute_page_title(cfg, out_path)
    out_dir = out_path.parent if out_path else Path(".")

    # compute href prefix safely
    try:
        href_prefix = _safe_relpath(assets_dir, out_dir)
    except Exception:
        href_prefix = "assets"

    # base head
    head_parts.append("<!DOCTYPE html>")
    head_parts.append("<html lang='en'>")
    head_parts.append("<head>")
    head_parts.append("<meta charset='utf-8'>")
    head_parts.append("<meta name='viewport' content='width=device-width,initial-scale=1'>")
    # Title (escaped)
    head_parts.append(f"<title>{page_title_esc}</title>")
    # default CSS var for sticky offset; runtime may override it
    try:
        default_h = int(_default_main_header_height() or 56)
    except Exception:
        default_h = 56
    head_parts.append(f"<style>:root{{--main-header-height:{default_h}px;}}</style>")

    # style inclusion (embed or external)
    if embed_assets:
        style_text = _read_asset_text(assets_dir, "style.css", style_fallback)
        overrides_text = _read_asset_text(assets_dir, "overrides.css", "")
        combined = (style_text or "") + "\n" + (overrides_text or "")
        head_parts.append(f"<style>{combined}</style>")
    else:
        href_style = f"{href_prefix}/style.css"
        head_parts.append(f'<link rel="stylesheet" href="{href_style}?v={int(time.time())}"{_sri_attr(href_style, cdn_integrity)}>')
        # optional overrides.css only when present
        try:
            if _is_valid_file(assets_dir / "overrides.css"):
                href_over = f"{href_prefix}/overrides.css"
                head_parts.append(f'<link rel="stylesheet" href="{href_over}?v={int(time.time())}">')
        except Exception:
            pass

    # close head and open body
    head_parts.append("</head>")
    head_parts.append("<body>")
    return head_parts, page_title_esc, href_prefix

def _build_sticky_header_html(page_title_esc: str) -> str:
    """
    Build the sticky header HTML block.
    Uses classes and ids. No inline styles or onclick attributes.
    All buttons explicitly include type="button" and aria-labels.
    """
    return (
        '<div id="tables-viewer" role="region" aria-label="Tables viewer">\n'
        '  <div id="stickyMainHeader">\n'
        '    <div id="tv-header">\n'
        f'      <div><h1>{page_title_esc}</h1></div>\n'
        '      <div class="tv-controls">\n'
        '        <input id="searchBox" class="search-input" type="search" placeholder="Search" aria-label="Search tables"/>\n'
        '        <button id="modeBtn" type="button" aria-label="Toggle theme">Theme</button>\n'
        '        <button id="toggleAllBtn" type="button" aria-label="Toggle all">Collapse All Tables</button>\n'
        '        <button id="copyAllPlainBtn" type="button" aria-label="Copy all tables as plain text">Copy All Tables (Plain Text)</button>\n'
        '        <button id="copyAllMdBtn" type="button" aria-label="Copy all tables as markdown">Copy All Tables (Markdown)</button>\n'
        '        <button id="resetAllBtn" type="button" aria-label="Reset all tables">Reset All Tables</button>\n'
        '      </div>\n'
        '    </div>\n'
        '    <noscript>\n'
        "      <div style='color:#b91c1c'>JavaScript is disabled. Tables will be shown statically. For large tables enable JS for virtualization.</div>\n"
        '    </noscript>\n'
        '  </div>\n'
    )

# End of chunk3
# core.chunk4.py -- Table fragment rendering utilities (rows, thead/tbody, data-label handling)
from typing import Iterator

def _prepare_table_stream(df) -> Tuple[List[str], List[Tuple], Iterator]:
    """
    Extract columns, sample rows and an iterator for streaming rows.
    Uses _take_and_stream when available to avoid loading full table into memory.
    """
    try:
        cols = list(df.columns)
    except Exception:
        cols = []
    sample_rows = []
    try:
        buf, it2 = _take_and_stream(df.itertuples(index=False), 100)
        sample_rows = buf[:]
        it_stream = it2
    except Exception:
        try:
            all_rows = list(df.itertuples(index=False))
            sample_rows = all_rows[:100]
            it_stream = iter(all_rows)
        except Exception:
            it_stream = df.itertuples(index=False)
    return cols, sample_rows, it_stream

def _derive_titles(idx: int, cols: List[str], sample_rows: List[Tuple], df, renderer: MarkdownRenderer) -> Tuple[str, str, str, str]:
    """
    Determine title_text, display_title, title_id and title_html for a table fragment.
    """
    title_text = None
    try:
        if hasattr(df, "title") and df.title:
            title_text = str(df.title).strip()
        elif hasattr(df, "name") and df.name:
            title_text = str(df.name).strip()
    except Exception:
        title_text = None

    if not title_text and sample_rows:
        try:
            first = sample_rows[0]
            cand = first[0] if len(first) > 0 else None
            if cand is None:
                for v in first:
                    if v not in (None, ""):
                        cand = v
                        break
            if cand is not None:
                title_text = str(cand).strip()
        except Exception:
            title_text = None

    if not title_text and cols:
        try:
            title_text = str(cols[0]).strip()
        except Exception:
            title_text = None

    if not title_text:
        title_text = f"Table {idx}"

    title_text = re.sub(r'\s+', ' ', title_text).strip()
    display_title = title_text if len(title_text) <= 120 else title_text[:117] + "..."
    title_id = _sanitize_id(display_title, idx)
    try:
        title_html = renderer.render(display_title)
    except Exception:
        title_html = html.escape(display_title)
    return title_text, display_title, title_id, title_html

def _render_table_fragment_to_file(
    idx: int,
    df,
    tmp_frag_dir: Path,
    renderer: MarkdownRenderer,
    cfg: RenderConfig,
    left_width: float,
    right_width: float,
    *,
    render_html_flag: bool = True
) -> Tuple[int, Path, int, List[Dict[str, Any]]]:
    """
    Render a single table fragment into tmp_frag_dir/frag_{idx}.html.
    Returns (idx, frag_file, final_line_count, warnings).
    """
    frag_warnings: List[Dict[str, Any]] = []
    table_id = _sanitize_id(f"Table{idx}", idx)
    cols, sample_rows, it_stream = _prepare_table_stream(df)
    col_types = _detect_column_types(sample_rows, cols)
    frag_file = tmp_frag_dir / f"frag_{idx}.html"

    # derive titles
    title_text, display_title, title_id, title_html = _derive_titles(idx, cols, sample_rows, df, renderer)

    # build header plain labels (escaped) for data-label attributes
    header_plain_labels: List[str] = []
    safe_headers_html: List[str] = []
    for c in cols:
        try:
            rendered = renderer.render(str(c))
        except Exception:
            rendered = html.escape(str(c))
        safe_headers_html.append(rendered)
        plain = re.sub(r'<[^>]+>', '', rendered)
        plain = html.unescape(plain).strip()
        header_plain_labels.append(_attr_escape(plain))

    def writer(f):
        # wrapper start
        f.write(f'<div class="table-wrapper" id="{table_id}">')
        f.write(f'<h3 id="{title_id}">{title_html}</h3>')

        # header controls (no inline styles or onclick)
        f.write('<div class="table-header-wrapper header-controls">')
        f.write('<div class="copy-buttons">')
        f.write(f'<button type="button" class="copy-plain-btn" data-table-index="{idx-1}" aria-label="Copy table as plain text">Copy Plain Table</button>')
        f.write(f'<button type="button" class="copy-md-btn" data-table-index="{idx-1}" aria-label="Copy table as markdown">Copy Markdown Table</button>')
        f.write('</div>')
        f.write('<div class="header-actions">')
        f.write(f'<button type="button" class="toggle-table-btn" data-table-index="{idx-1}" aria-label="Toggle table">Collapse Table</button>')
        f.write('</div>')
        f.write('</div>')

        # table container
        f.write('<div class="table-container">')
        caption_text = _safe_caption(display_title)
        if caption_text:
            f.write(f'<table><caption>{caption_text}</caption><thead><tr>')
        else:
            f.write('<table><thead><tr>')

        # write thead
        for i, col in enumerate(cols):
            th_id = f'{table_id}-th-{i}'
            data_table_index = idx - 1
            data_col_index = i
            aria_label = f"Sort by {html.escape(re.sub(r'<[^>]+>', '', str(col)))}"
            f.write(
                f'<th id="{th_id}" class="col-{col_types[i]}" data-table-index="{data_table_index}" data-col-index="{data_col_index}" role="button" aria-label="{_attr_escape(aria_label)}">'
            )
            f.write('<div class="th-with-sort">')
            # header label (may contain safe HTML)
            f.write(f'<div class="th-label">{safe_headers_html[i]}</div>')
            # sort button uses data attributes, no inline handlers
            f.write(
                f'<button type="button" class="sort-btn sort-state-0" data-table-index="{data_table_index}" data-col-index="{data_col_index}" title="Toggle sort" aria-label="Toggle sort"><span class="sort-icon" aria-hidden="true"></span></button>'
            )
            f.write('</div>')
            f.write('</th>')
        f.write('</tr></thead><tbody>')

        # iterate rows and write tbody
        r_idx = 0
        try:
            for row in it_stream:
                if getattr(cfg, "cancel_event", None) and getattr(cfg, "cancel_event", None).is_set():
                    frag_warnings.append({"level": "warn", "msg": "canceled", "table": idx})
                    break
                r_idx += 1
                if getattr(cfg, "table_row_limit", 0) and r_idx > getattr(cfg, "table_row_limit", 0):
                    frag_warnings.append({"level": "warn", "msg": "table_row_limit exceeded", "table": idx, "row": r_idx})
                    break
                cells = []
                # detect first column raw for potential section headings
                first_col_raw = None
                try:
                    if len(row) > 0:
                        first_col_raw = "" if row[0] is None else str(row[0])
                except Exception:
                    first_col_raw = None

                for col_i, val in enumerate(row):
                    try:
                        raw = "" if val is None else str(val)
                        cell_src = _normalize_list_markers(convert_bullets_to_ul(raw))
                        if render_html_flag:
                            try:
                                cell_html = renderer.render(cell_src)
                            except Exception:
                                cell_html = html.escape(cell_src)
                                frag_warnings.append({"level": "warn", "msg": "markdown render failed", "table": idx, "row": r_idx, "col": col_i})
                        else:
                            cell_html = html.escape(cell_src)
                        # unescape bracketed content outside code if helper exists
                        try:
                            cell_html = _unescape_brackets_outside_code(cell_html) or ""
                        except Exception:
                            pass
                    except Exception as e:
                        cell_html = html.escape(str(val or ""))
                        frag_warnings.append({"level": "warn", "msg": f"cell render failed: {e}", "table": idx, "row": r_idx, "col": col_i})

                    # sanitize whitelist (conservative)
                    try:
                        cell_html = _sanitize_html_whitelist(cell_html or "")
                        if not cell_html:
                            cell_html = html.escape(str(val or ""))
                    except Exception:
                        cell_html = html.escape(str(val or ""))

                    # data-label: use precomputed plain header label (escaped)
                    data_label = header_plain_labels[col_i] if col_i < len(header_plain_labels) else _attr_escape(str(cols[col_i]) if col_i < len(cols) else "")

                    # first column section detection
                    if col_i == 0 and first_col_raw:
                        try:
                            plain = re.sub(r'<[^>]+>', '', cell_html).strip()
                        except Exception:
                            plain = html.escape(str(first_col_raw)).strip()
                        is_heading = False
                        if re.match(r'^\s*\d+[\.\)]', plain):
                            is_heading = True
                        elif len(plain) < 120 and plain.upper() == plain and len(plain.split()) <= 8 and len(plain) > 2:
                            is_heading = True
                        if is_heading:
                            section_id = _sanitize_id(f"{table_id}-section-{plain}", f"{idx}-{r_idx}")
                            # wrap heading in div with id
                            cell_html = f'<div class="section-heading" id="{section_id}">{cell_html}</div>'
                    cells.append(f'<td data-label="{data_label}">{cell_html}</td>')
                f.write("<tr>" + "".join(cells) + "</tr>")
        except Exception as e:
            frag_warnings.append({"level": "error", "msg": f"row iteration failed: {e}", "table": idx})

        f.write('</tbody></table></div>')  # close table and container
        f.write(f'<div class="row-count"></div>')
        f.write(f'<div class="table-summary">Rows: {r_idx} | Columns: {len(cols)}</div>')
        f.write('</div>')  # close wrapper

    # attempt atomic write
    try:
        if _atomic_stream_write:
            _atomic_stream_write(frag_file, writer)
        else:
            _default_write_atomic(frag_file, writer)
    except Exception as e:
        frag_warnings.append({"level": "error", "msg": f"fragment write failed: {e}", "table": idx})

    # compute final line count as a conservative estimate
    final_count = 0
    try:
        with frag_file.open("r", encoding="utf-8", errors="ignore") as rf:
            for _ in rf:
                final_count += 1
    except Exception:
        final_count = 0

    return (idx, frag_file, final_count, frag_warnings)
# core.chunk5.py -- Script/asset wiring, shim, export worker wiring, runtime DOMContentLoaded wiring
from typing import Optional

def _build_bottom_script_parts(
    assets_dir: Path,
    href_prefix: str,
    cfg: RenderConfig,
    *,
    embed_assets: bool = False,
    script_fallback: str = "",
    cdn_integrity: Optional[Dict[str, str]] = None,
    export_template_js: Optional[str] = None,
    output_user: Optional[str] = None
) -> List[str]:
    """
    Build the bottom <script> parts to append to the page.
    - If embed_assets is True the script is inlined.
    - If external script missing a minimal shim is appended so page won't throw.
    - If worker.js exists an export wiring snippet is appended.
    - Returns list of HTML strings to write at the bottom of the page.
    """
    parts: List[str] = []
    try:
        script_file = assets_dir / "script.js"
        script_valid = _is_valid_file(script_file)
    except Exception:
        script_valid = False

    # embed or reference script.js
    if getattr(cfg, "embed_assets", False) or embed_assets:
        try:
            script_text = _read_asset_text(assets_dir, "script.js", script_fallback)
        except Exception:
            script_text = script_fallback or ""
        parts.append(f"<script>{script_text}</script>")
        script_valid = True  # inline provided
    else:
        # external script reference (deferred)
        script_href = f"{href_prefix}/script.js"
        parts.append(f'<script src="{script_href}?v={int(time.time())}" defer{_sri_attr(script_href, cdn_integrity)}></script>')
        # provide minimal shim if external file missing
        if not script_valid:
            parts.append(_minimal_shim_script())

    # export worker wiring appended only when worker.js exists
    try:
        worker_file = assets_dir / "worker.js"
        worker_exists = _is_valid_file(worker_file)
    except Exception:
        worker_exists = False

    if worker_exists and export_template_js is not None:
        parts.append(_build_export_worker_script(href_prefix, export_template_js, output_user or ""))

    # runtime wiring always appended; it is safe and guards missing functions
    parts.append(_runtime_wiring_script(href_prefix))

    return parts

def _minimal_shim_script() -> str:
    """
    Minimal safe shim to avoid runtime ReferenceError when script.js is missing.
    Provides conservative implementations for core functions used by generated HTML.
    """
    return """<script>
(function(){
  if(window.__tv_shim_installed) return;
  window.__tv_shim_installed = true;
  window.__tv_sortStates = window.__tv_sortStates || [];

  function getTable(tableIdx){ return document.querySelectorAll(".table-container table")[tableIdx]; }

  window.updateHeaderSortUI = function(tableIdx){
    try{
      const table = getTable(tableIdx);
      if(!table || !table.tHead) return;
      const ths = table.tHead.rows[0].cells;
      for(let c=0;c<ths.length;c++){
        const btn = ths[c].querySelector('.sort-btn');
        if(!btn) continue;
        btn.classList.remove('sort-state-0','sort-state-1','sort-state-2');
        const state = (window.__tv_sortStates[tableIdx]||[])[c]||0;
        btn.classList.add('sort-state-'+state);
        if(state===1) ths[c].setAttribute('aria-sort','ascending');
        else if(state===2) ths[c].setAttribute('aria-sort','descending');
        else ths[c].setAttribute('aria-sort','none');
      }
    }catch(e){}
  };

  window.sortTableByColumn = function(tableIdx, colIdx){
    try{
      const table = getTable(tableIdx);
      if(!table) return;
      window.__tv_sortStates[tableIdx] = window.__tv_sortStates[tableIdx] || Array(table.rows[0].cells.length).fill(0);
      let state = window.__tv_sortStates[tableIdx][colIdx] || 0;
      const tbody = table.tBodies[0];
      const rows = Array.from(tbody.rows);
      const key = (row)=> row.cells[colIdx] ? row.cells[colIdx].textContent.trim() : "";
      const num = (v)=> { const n = parseFloat(String(v).replace(/,/g,'')); return isNaN(n)?null:n; };
      if(state===0){
        rows.sort((a,b)=>{ const A=key(a), B=key(b); const nA=num(A), nB=num(B); if(nA!==null && nB!==null) return nA-nB; return A.localeCompare(B); });
        window.__tv_sortStates[tableIdx][colIdx]=1;
      } else if(state===1){
        rows.sort((a,b)=>{ const A=key(a), B=key(b); const nA=num(A), nB=num(B); if(nA!==null && nB!==null) return nB-nA; return B.localeCompare(A); });
        window.__tv_sortStates[tableIdx][colIdx]=2;
      } else {
        const original = (window.__tv_originalRows || {})[tableIdx];
        if(original){ tbody.innerHTML=''; original.forEach(r=> tbody.appendChild(r.cloneNode(true))); window.__tv_sortStates[tableIdx] = Array(table.rows[0].cells.length).fill(0); updateHeaderSortUI(tableIdx); updateRowCounts(); return; }
        window.__tv_sortStates[tableIdx][colIdx]=0;
      }
      tbody.innerHTML='';
      rows.forEach(r=> tbody.appendChild(r));
      for(let i=0;i< (window.__tv_sortStates[tableIdx]||[]).length;i++){ if(i!==colIdx) window.__tv_sortStates[tableIdx][i]=0; }
      updateHeaderSortUI(tableIdx);
      try{ updateRowCounts(); }catch(e){}
    }catch(e){}
  };

  window.headerSortButtonClicked = function(tableIdx,colIdx,btnEl){ sortTableByColumn(tableIdx,colIdx); try{ btnEl && btnEl.focus(); }catch(e){} };

  window.toggleTable = function(btn){
    try{
      const wrapper = btn && btn.closest('.table-wrapper');
      if(!wrapper) return;
      const collapsed = wrapper.classList.toggle('table-collapsed');
      btn.textContent = collapsed ? "Expand Table" : "Collapse Table";
      const anyExpanded = document.querySelectorAll('.table-wrapper:not(.table-collapsed)').length>0;
      const toggleAllBtn = document.getElementById('toggleAllBtn');
      if(toggleAllBtn) toggleAllBtn.textContent = anyExpanded ? "Collapse All Tables" : "Expand All Tables";
      try{ updateRowCounts(); }catch(e){}
    }catch(e){}
  };

  window.toggleAllTables = function(){
    try{
      const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
      if(wrappers.length===0) return;
      const anyExpanded = wrappers.some(w=> !w.classList.contains('table-collapsed'));
      if(anyExpanded){
        wrappers.forEach(w=>{ w.classList.add('table-collapsed'); const btn=w.querySelector('.toggle-table-btn'); if(btn) btn.textContent="Expand Table"; });
        const toggleAllBtn=document.getElementById('toggleAllBtn'); if(toggleAllBtn) toggleAllBtn.textContent="Expand All Tables";
      } else {
        wrappers.forEach(w=>{ w.classList.remove('table-collapsed'); const btn=w.querySelector('.toggle-table-btn'); if(btn) btn.textContent="Collapse Table"; });
        const toggleAllBtn=document.getElementById('toggleAllBtn'); if(toggleAllBtn) toggleAllBtn.textContent="Collapse All Tables";
      }
      try{ updateRowCounts(); }catch(e){}
    }catch(e){}
  };

  window.copyTablePlain = function(btn){
    try{
      const table = btn && btn.closest('.table-wrapper') && btn.closest('.table-wrapper').querySelector('table');
      if(!table) return;
      let title = btn.closest('.table-wrapper').querySelector('h3')?.textContent||'';
      let text = title + "\\n" + Array.from(table.rows).map(r=> Array.from(r.cells).map(c=> c.textContent.trim()).join("\\t")).join("\\n");
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(()=>{}).catch(()=>{}); } else { try{ prompt('Copy table text', text);}catch(e){} }
    }catch(e){}
  };

  window.copyTableMarkdown = function(btn){
    try{
      const table = btn && btn.closest('.table-wrapper') && btn.closest('.table-wrapper').querySelector('table');
      if(!table) return;
      let title = btn.closest('.table-wrapper').querySelector('h3')?.textContent||'';
      let rows = Array.from(table.rows);
      if(rows.length===0) return;
      let head = Array.from(rows[0].cells).map(c=>c.textContent.trim()).join(' | ');
      let md = "**"+title+"**\\n| "+head+" |\\n| "+Array.from(rows[0].cells).map(()=> '---').join(' | ')+" |\\n";
      for(let i=1;i<rows.length;i++){ md += "| "+Array.from(rows[i].cells).map(c=>c.textContent.trim()).join(" | ")+" |\\n"; }
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(md).then(()=>{}).catch(()=>{}); } else { try{ prompt('Copy table markdown', md);}catch(e){} }
    }catch(e){}
  };

  window.copyAllTablesPlain = function(){
    try{
      let text = "";
      document.querySelectorAll(".table-wrapper").forEach(wrapper=>{ let title = wrapper.querySelector('h3')?.textContent||''; let table = wrapper.querySelector('table'); if(!table) return; text += title + "\\n" + Array.from(table.rows).map(r=> Array.from(r.cells).map(c=> c.textContent.trim()).join("\\t")).join("\\n") + "\\n"; });
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(()=>{}).catch(()=>{}); } else { try{ prompt('Copy all tables', text);}catch(e){} }
    }catch(e){}
  };

  window.copyAllTablesMarkdown = function(){
    try{
      let text = "";
      document.querySelectorAll(".table-wrapper").forEach(wrapper=>{ let title = wrapper.querySelector('h3')?.textContent||''; let table = wrapper.querySelector('table'); if(!table) return; let rows = Array.from(table.rows); if(rows.length===0) return; let head = Array.from(rows[0].cells).map(c=>c.textContent.trim()).join(' | '); text += "**"+title+"**\\n| "+head+" |\\n| "+Array.from(rows[0].cells).map(()=> '---').join(' | ')+" |\\n"; for(let i=1;i<rows.length;i++){ text += "| "+Array.from(rows[i].cells).map(c=>c.textContent.trim()).join(" | ")+" |\\n"; } });
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(()=>{}).catch(()=>{}); } else { try{ prompt('Copy all tables markdown', text);}catch(e){} }
    }catch(e){}
  };

  window.resetAllTables = function(){ try{ location.reload(); }catch(e){} };

  window.searchTable = function(){
    try{
      let filter=(document.getElementById("searchBox")?.value||"").toLowerCase();
      let firstMatch=null;
      document.querySelectorAll(".table-container table").forEach(table=>{ Array.from(table.rows).slice(1).forEach(row=>{ let rowMatches=false; Array.from(row.cells).forEach(cell=>{ let text=(cell.textContent||'').toLowerCase(); if(text.includes(filter)&&filter!==''){ cell.classList.add("highlight"); rowMatches=true; if(!firstMatch) firstMatch=row; }else{ cell.classList.remove("highlight"); } }); row.style.display = rowMatches || filter==='' ? "" : "none"; }); });
      if(firstMatch){ const rect=firstMatch.getBoundingClientRect(); const headerHeight=document.getElementById('tv-header')?.offsetHeight||0; const scrollTop=window.pageYOffset||document.documentElement.scrollTop; window.scrollTo({top:scrollTop+rect.top-headerHeight-5,behavior:'smooth'}); }
      try{ updateRowCounts(); }catch(e){}
    }catch(e){}
  };

  window.updateRowCounts = function(){
    try{
      document.querySelectorAll(".table-wrapper").forEach((wrapper,idx)=>{ const table=wrapper.querySelector("table"); const countDiv=wrapper.querySelector(".row-count"); if(!table||!countDiv) return; const rows=table.tBodies[0].rows; const total=rows.length; const visible=Array.from(rows).filter(r=>r.style.display!=="none").length; if(total===0) countDiv.textContent="Showing 0 rows"; else if(visible===total) countDiv.textContent=`Showing ${total} rows`; else countDiv.textContent=`Showing ${visible} of ${total} rows`; });
    }catch(e){}
  };

  try{
    window.__tv_originalRows = window.__tv_originalRows || {};
    document.querySelectorAll(".table-container table").forEach((table, idx)=>{ const rows = Array.from(table.tBodies[0].rows).map(r=> r.cloneNode(true)); window.__tv_originalRows[idx] = rows; window.__tv_sortStates[idx] = window.__tv_sortStates[idx] || Array(table.rows[0]?.cells.length||0).fill(0); });
  }catch(e){}
})();
</script>"""

def _build_export_worker_script(href_prefix: str, export_template_js: str, output_user: str) -> str:
    """
    Returns a script string that wires an export button to worker.js.
    export_template_js must be a JS literal (e.g. json.dumps string).
    """
    # keep minimal and defensive
    user_esc = _attr_escape(output_user or "")
    worker_path = f"{href_prefix}/worker.js"
    return (
        "<script>\n"
        "document.addEventListener('DOMContentLoaded', function(){\n"
        f"  const template = {export_template_js};\n"
        "  function formatName(tableName){ const date=(new Date()).toISOString().slice(0,10); return template.replace('{table}',tableName).replace('{date}',date).replace('{user}', '" + user_esc + "'); }\n"
        "  const btn = document.getElementById('exportBtn');\n"
        "  if(btn){ btn.addEventListener('click', async function(){ try{ const html=document.documentElement.outerHTML; if(html.length>2000000){ alert('Export refused: html too large'); return; } if(window.Worker){ const worker=new Worker('" + worker_path + "'); worker.postMessage({html:html, format:'pdf'}); worker.onmessage=function(e){ console.log('worker:',e.data); alert('Worker replied: '+(e.data.msg||e.data.status)); }; } else { alert('Export worker not supported.'); } }catch(err){ console.warn('Export failed', err); alert('Export failed. See console.'); } }); }\n"
        "});\n"
        "</script>"
    )

def _runtime_wiring_script(href_prefix: str) -> str:
    """
    Runtime wiring appended at the bottom to attach event listeners.
    Defers execution with DOMContentLoaded and guards all calls.
    """
    # Use a normal string to avoid f-string braces issues.
    return """<script>
document.addEventListener('DOMContentLoaded', function(){
  try{
    // set CSS var for header height so sticky thead uses correct offset
    var hh = document.getElementById('stickyMainHeader')?.offsetHeight || 56;
    document.documentElement.style.setProperty('--main-header-height', hh + 'px');

    // wire th/header click handlers (data-attrs)
    document.querySelectorAll('thead th[data-table-index][data-col-index]').forEach(function(th){
      th.addEventListener('click', function(){ try{ var t=parseInt(this.dataset.tableIndex,10); var c=parseInt(this.dataset.colIndex,10); if(window.sortTableByColumn) window.sortTableByColumn(t,c); }catch(e){}; });
    });

    // wire sort buttons
    document.querySelectorAll('.sort-btn[data-table-index]').forEach(function(btn){
      btn.addEventListener('click', function(e){ e.stopPropagation(); try{ var t=parseInt(this.dataset.tableIndex,10); var c=parseInt(this.dataset.colIndex,10); if(window.headerSortButtonClicked) window.headerSortButtonClicked(t,c,this); }catch(e){}; });
    });

    // wire copy/collapse buttons
    document.querySelectorAll('.copy-plain-btn').forEach(function(b){ b.addEventListener('click', function(){ try{ if(window.copyTablePlain) window.copyTablePlain(this); }catch(e){} }); });
    document.querySelectorAll('.copy-md-btn').forEach(function(b){ b.addEventListener('click', function(){ try{ if(window.copyTableMarkdown) window.copyTableMarkdown(this); }catch(e){} }); });
    document.querySelectorAll('.toggle-table-btn').forEach(function(b){ b.addEventListener('click', function(){ try{ if(window.toggleTable) window.toggleTable(b); }catch(e){} }); });

    // top header buttons by id
    var tide = document.getElementById('toggleAllBtn'); if(tide) tide.addEventListener('click', function(){ try{ if(window.toggleAllTables) window.toggleAllTables(); }catch(e){} });
    var mode = document.getElementById('modeBtn'); if(mode) mode.addEventListener('click', function(){ try{ if(window.toggleMode) window.toggleMode(); }catch(e){} });
    var copyP = document.getElementById('copyAllPlainBtn'); if(copyP) copyP.addEventListener('click', function(){ try{ if(window.copyAllTablesPlain) window.copyAllTablesPlain(); }catch(e){} });
    var copyM = document.getElementById('copyAllMdBtn'); if(copyM) copyM.addEventListener('click', function(){ try{ if(window.copyAllTablesMarkdown) window.copyAllTablesMarkdown(); }catch(e){} });
    var reset = document.getElementById('resetAllBtn'); if(reset) reset.addEventListener('click', function(){ try{ if(window.resetAllTables) window.resetAllTables(); }catch(e){} });

    // search debounce
    var sb = document.getElementById('searchBox');
    if(sb){
      var _tv_search_timer = null;
      sb.addEventListener('input', function(){
        try{
          if(_tv_search_timer) clearTimeout(_tv_search_timer);
          _tv_search_timer = setTimeout(function(){ try{ if(window.searchTable) window.searchTable(); }catch(e){} }, 250);
        }catch(e){}
      });
    }

    // update UI state after wiring
    try{ if(window.updateRowCounts) window.updateRowCounts(); if(window.__tv_originalRows) { for(var i=0;i<document.querySelectorAll('.table-container table').length;i++){ if(window.updateHeaderSortUI) window.updateHeaderSortUI(i); } } }catch(e){}
  }catch(e){}
});
</script>"""
# core.chunk6.py -- Orchestration: render_html, assets copy, fragment orchestration, final write
from typing import Iterable

def render_html(
    all_tables: Iterable[TableLike],
    output_html: str,
    markdown_to_html: Callable[[str], str],
    *,
    output_user: Optional[str] = None,
    export_name_template: Optional[str] = None,
    cdn_integrity: Optional[Dict[str, str]] = None,
    render_cell: Optional[Callable[[Any, int, int], str]] = None,
    config: Optional[RenderConfig] = None,
    return_html: bool = False,
    materialize: bool = False,
) -> Dict[str, Any]:
    """
    High-level orchestrator that assembles fragments, copies assets, writes final HTML.
    Uses the helper functions built in previous chunks.
    """
    cfg = config or RenderConfig()
    logger.setLevel(getattr(cfg, "log_level", logging.INFO))
    start = time.time()
    warnings: List[Dict[str, Any]] = []

    # sanitize output path and prepare directories
    output_html = _sanitize_output_path(output_html)
    out_path = Path(output_html)
    out_dir = out_path.parent
    try:
        if _ensure_dir:
            _ensure_dir(out_dir)
        else:
            _ensure_dir_path(out_dir)
    except Exception:
        _ensure_dir_path(out_dir)

    # layout width hints (kept for compatibility)
    total_units = 2 + 5
    left_width = 2 / total_units * 100
    right_width = 5 / total_units * 100

    # resolve assets dir
    try:
        if hasattr(cfg, "resolved_assets_dir"):
            assets_dir = Path(cfg.resolved_assets_dir(out_dir))
        else:
            _val = getattr(cfg, "assets_dir", None)
            assets_dir = Path(_val) if _val else (out_dir / "assets")
    except Exception:
        _val = getattr(cfg, "assets_dir", None)
        assets_dir = Path(_val) if _val else (out_dir / "assets")
    assets_parent = assets_dir.parent
    _ensure_dir_path(assets_parent)

    # detect project assets source or fallback to package assets
    assets_source_cfg = getattr(cfg, "assets_source_dir", None)
    if assets_source_cfg:
        proj_assets = Path(assets_source_cfg)
    else:
        proj_assets = Path(__file__).resolve().parent.parent / "assets"
    pkg_assets = Path(__file__).resolve().parent / "assets"
    if not proj_assets.exists() and pkg_assets.exists():
        proj_assets = pkg_assets

    style_fallback = _EMBED_STYLE or ""
    script_fallback = _EMBED_SCRIPT or ""
    assets_written = False

    # copy assets (style, script, worker, overrides) with safe fallbacks
    try:
        _assets_to_copy = ("style.css", "script.js", "worker.js", "overrides.css")
        if proj_assets.exists() and proj_assets.is_dir():
            _ensure_dir_path(assets_dir)
            for fname in _assets_to_copy:
                src = proj_assets / fname
                dst = assets_dir / fname
                try:
                    if _is_valid_file(src):
                        replace = (not _is_valid_file(dst)) or (src.stat().st_mtime > dst.stat().st_mtime)
                        if replace:
                            shutil.copy2(str(src), str(dst))
                    else:
                        if fname == "style.css":
                            dst.write_text(style_fallback, encoding="utf-8")
                        elif fname == "script.js":
                            dst.write_text(script_fallback, encoding="utf-8")
                        else:
                            dst.write_text("", encoding="utf-8")
                except Exception as e:
                    warnings.append({"level": "warn", "msg": f"proj asset copy failed for {fname}: {e}"})
            assets_written = True
        else:
            # attempt package-level copy via copy_assets helper if available
            if callable(copy_assets):
                try:
                    copy_assets(str(out_dir))
                    assets_written = True
                except Exception as e:
                    warnings.append({"level": "warn", "msg": f"copy_assets() failed: {e}"})
            # fallback to package assets directory if present
            if not assets_written and pkg_assets.exists() and pkg_assets.is_dir():
                _ensure_dir_path(assets_dir)
                for fname in _assets_to_copy:
                    src = pkg_assets / fname
                    dst = assets_dir / fname
                    try:
                        if _is_valid_file(src):
                            replace = (not _is_valid_file(dst)) or (src.stat().st_mtime > dst.stat().st_mtime)
                            if replace:
                                shutil.copy2(str(src), str(dst))
                        else:
                            if fname == "style.css":
                                dst.write_text(style_fallback, encoding="utf-8")
                            elif fname == "script.js":
                                dst.write_text(script_fallback, encoding="utf-8")
                            else:
                                dst.write_text("", encoding="utf-8")
                    except Exception as e:
                        warnings.append({"level": "warn", "msg": f"pkg asset copy failed for {fname}: {e}"})
                assets_written = True
            # final fallback: write minimal assets into assets_dir
            if not assets_written:
                _ensure_dir_path(assets_dir)
                try:
                    (assets_dir / "style.css").write_text(style_fallback, encoding="utf-8")
                    (assets_dir / "script.js").write_text(script_fallback, encoding="utf-8")
                    (assets_dir / "worker.js").write_text("", encoding="utf-8")
                    (assets_dir / "overrides.css").write_text("", encoding="utf-8")
                    warnings.append({"level": "warn", "msg": "no assets source found; wrote embedded fallback assets"})
                    assets_written = True
                except Exception as e:
                    warnings.append({"level": "warn", "msg": f"failed to write fallback assets: {e}"})
    except Exception as e:
        warnings.append({"level": "warn", "msg": f"unexpected assets handling error: {e}"})

    # allow generator to write overrides.css via helper if available
    try:
        if callable(write_overrides_css):
            try:
                write_overrides_css(str(out_dir), left_width, right_width)
            except Exception as e:
                warnings.append({"level": "warn", "msg": f"write_overrides_css failed: {e}"})
        else:
            try:
                (assets_dir / "overrides.css").write_text("", encoding="utf-8")
            except Exception:
                pass
    except Exception:
        pass

    # optionally create README in output dir if helper present
    try:
        if callable(_generate_readme):
            try:
                _generate_readme(out_dir)
            except Exception:
                pass
    except Exception:
        pass

    # prepare renderer for markdown -> safe HTML
    renderer = MarkdownRenderer(markdown_to_html, cache_size=getattr(cfg, "cache_size", 100),
                                timeout_s=(getattr(cfg, "table_render_timeout_ms", 500) or 500) / 1000.0)

    # materialize tables list early if requested
    tables_iter = all_tables
    if materialize:
        tables_list = list(tables_iter)
    else:
        try:
            tables_list = list(tables_iter)
        except Exception:
            # best-effort fallback
            tables_list = list(tables_iter)
    total_tables = len(tables_list)

    # handle split threshold (server-side chunking) conservatively
    if getattr(cfg, "split_threshold", 0):
        try:
            row_counts = []
            for df in tables_list:
                cnt = 0
                try:
                    for _ in df.itertuples(index=False):
                        cnt += 1
                except Exception:
                    cnt = 0
                row_counts.append(cnt)
            total_rows = sum(row_counts)
            if total_rows > getattr(cfg, "split_threshold"):
                parts = []
                cur_rows = 0
                cur_tables = []
                part_no = 1
                for df, rc in zip(tables_list, row_counts):
                    if cur_rows + rc > getattr(cfg, "split_threshold") and cur_tables:
                        part_name = out_dir / f"{out_path.stem}_part{part_no}{out_path.suffix}"
                        render_html(cur_tables, str(part_name), markdown_to_html,
                                    output_user=output_user, export_name_template=export_name_template,
                                    cdn_integrity=cdn_integrity, render_cell=render_cell,
                                    config=cfg, return_html=False, materialize=True)
                        parts.append(str(part_name))
                        part_no += 1
                        cur_tables = []
                        cur_rows = 0
                    cur_tables.append(df)
                    cur_rows += rc
                if cur_tables:
                    part_name = out_dir / f"{out_path.stem}_part{part_no}{out_path.suffix}"
                    render_html(cur_tables, str(part_name), markdown_to_html,
                                output_user=output_user, export_name_template=export_name_template,
                                cdn_integrity=cdn_integrity, render_cell=render_cell,
                                config=cfg, return_html=False, materialize=True)
                    parts.append(str(part_name))
                index_html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Index</title></head><body><h1>Parts</h1><ul>"
                for p in parts:
                    index_html += f'<li><a href="{Path(p).name}">{Path(p).name}</a></li>'
                index_html += "</ul></body></html>"
                try:
                    _default_write_atomic(out_dir / f"{out_path.stem}_index.html", lambda f: f.write(index_html))
                except Exception:
                    try:
                        (out_dir / f"{out_path.stem}_index.html").write_text(index_html, encoding="utf-8")
                    except Exception:
                        pass
                return {"warnings": warnings, "tables": len(tables_list), "rows": total_rows, "parts": parts, "runtime_ms": int((time.time() - start) * 1000)}
        except Exception as e:
            warnings.append({"level": "warn", "msg": f"split_threshold processing failed: {e}"})

    # create temporary fragment dir
    try:
        tmp_frag_dir = Path(str(out_dir)) / (".frags_" + str(int(time.time() * 1000)))
        tmp_frag_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        tmp_frag_dir = out_dir

    # render fragments in thread pool
    fragments_map: Dict[int, Dict[str, Any]] = {}
    frag_row_counts: Dict[int, int] = {}
    total_rows = 0
    worker_count = max(1, min(len(tables_list) or 1, getattr(cfg, "max_workers", 4)))
    finished_tables = 0
    submitted = []

    with ThreadPoolExecutor(max_workers=worker_count) as ex:
        for i, df in enumerate(tables_list, start=1):
            fut = ex.submit(
                _render_table_fragment_to_file,
                i,
                df,
                tmp_frag_dir,
                renderer,
                cfg,
                left_width,
                right_width,
                True  # render_html_flag True (safe default)
            )
            submitted.append((fut, i))
        futures_only = [f for f, _ in submitted]
        try:
            for fut in as_completed(futures_only):
                try:
                    i, frag_path, rcount, frag_warnings = fut.result()
                    content = ""
                    try:
                        with frag_path.open("r", encoding="utf-8", errors="ignore") as rf:
                            content = rf.read()
                    except Exception:
                        content = ""
                    title_id = None
                    title_text = None
                    sections: List[Tuple[str, str]] = []
                    if content:
                        m = re.search(r'<h3[^>]*id=["\']([^"\']+)["\'][^>]*>(.*?)</h3>', content, flags=re.IGNORECASE | re.DOTALL)
                        if m:
                            title_id = m.group(1)
                            raw = m.group(2)
                            title_text = re.sub(r'<[^>]+>', '', raw).strip()
                            title_text = html.unescape(title_text)
                        for sm in re.finditer(r'<div class="section-heading" id="([^"]+)">(.*?)</div>', content, flags=re.IGNORECASE | re.DOTALL):
                            sid = sm.group(1)
                            sraw = sm.group(2)
                            stext = re.sub(r'<[^>]+>', '', sraw).strip()
                            stext = html.unescape(stext)
                            sections.append((sid, stext))
                    if not title_id:
                        title_id = f"Table{i}"
                    if not title_text:
                        title_text = f"Table {i}"
                    fragments_map[i] = {"path": frag_path, "content": content, "title_id": title_id, "title_text": title_text, "sections": sections}
                    frag_row_counts[i] = rcount
                    total_rows += rcount
                    warnings.extend(frag_warnings)
                    finished_tables += 1
                    if getattr(cfg, "progress_callback", None):
                        try:
                            cfg.progress_callback(finished_tables, total_tables)
                        except Exception:
                            pass
                    logger.info("Table %d fragment rendered (%d lines)", i, rcount)
                except Exception as e:
                    warnings.append({"level": "error", "msg": f"table render failed: {e}", "table": None})
        except KeyboardInterrupt:
            for fut, _ in submitted:
                try:
                    fut.cancel()
                except Exception:
                    pass
            raise

    # utility: does fragment contain rows
    def _frag_contains_rows(content: str) -> bool:
        if not content:
            return False
        return bool(re.search(r'<tbody>\s*<tr', content, flags=re.IGNORECASE))

    need_fallback = False
    if not fragments_map:
        need_fallback = True
        warnings.append({"level": "warn", "msg": "no fragments produced; falling back to inline rendering"})
    else:
        any_with_rows = any(_frag_contains_rows(v["content"]) for v in fragments_map.values())
        if not any_with_rows:
            need_fallback = True
            warnings.append({"level": "warn", "msg": "fragments contain no rows; falling back to inline rendering"})

    # build head parts and sticky header
    head_parts, page_title_esc, href_prefix = _build_head_parts(out_path, assets_dir, cfg, embed_assets=getattr(cfg, "embed_assets", False), style_fallback=style_fallback, cdn_integrity=cdn_integrity)
    sticky_html = _build_sticky_header_html(page_title_esc)

    # toc and inline parts (fallback)
    frag_paths_ordered: List[Path] = []
    toc_items: List[str] = []
    inline_parts: List[str] = []

    if not need_fallback:
        for idx in sorted(fragments_map.keys()):
            meta = fragments_map[idx]
            frag_paths_ordered.append(meta["path"])
            title_id = meta.get("title_id", f"Table{idx}")
            title_text = meta.get("title_text", f"Table {idx}")
            toc_items.append(f'<li class="toc-item"><a class="toc-link" href="#{html.escape(title_id)}">{html.escape(title_text)}</a></li>')
    else:
        for idx, df in enumerate(tables_list, start=1):
            piece = ""
            try:
                if convert_render_table is not None:
                    piece = convert_render_table(df, idx, markdown_to_html, left_width, right_width)
                else:
                    try:
                        piece = f"<h3 id='Table{idx}'>Table {idx}</h3>\n" + df.to_html(index=False, border=0, escape=True)
                    except Exception:
                        piece = f"<h3 id='Table{idx}'>Table {idx}</h3>\n<p>(failed to render table)</p>"
            except Exception as e:
                warnings.append({"level": "warn", "msg": f"inline render failed for table {idx}: {e}"})
                piece = f"<h3 id='Table{idx}'>Table {idx}</h3>\n<p>(failed to render table)</p>"

            title_id = None
            title_text = f"Table {idx}"
            m = re.search(r'<h3[^>]*id=["\']([^"\']+)["\'][^>]*>(.*?)</h3>', piece, flags=re.IGNORECASE | re.DOTALL)
            if m:
                title_id = m.group(1)
                title_text = re.sub(r'<[^>]+>', '', m.group(2)).strip()
                title_text = html.unescape(title_text)
            else:
                title_id = f"Table{idx}"
            toc_items.append(f'<li class="toc-item"><a class="toc-link" href="#{html.escape(title_id)}">{html.escape(title_text)}</a></li>')
            inline_parts.append(piece)

    toc = '<div id="tocBar" role="navigation" aria-label="Table of contents"><ul>' + "\n".join(toc_items) + "</ul></div>"

    # bottom script parts; export_template safety
    export_template = export_name_template or "{table}_{date}"
    export_template_js = json.dumps(export_template)
    bottom_parts = _build_bottom_script_parts(assets_dir, href_prefix, cfg, embed_assets=getattr(cfg, "embed_assets", False), script_fallback=script_fallback, cdn_integrity=cdn_integrity, export_template_js=export_template_js, output_user=output_user)

    # assemble final HTML writer
    try:
        def writer(f):
            for part in head_parts:
                f.write(part); f.write("\n")
            f.write(sticky_html); f.write("\n")
            f.write(toc); f.write("\n")
            if not need_fallback:
                for fp in frag_paths_ordered:
                    try:
                        with fp.open("r", encoding="utf-8") as rf:
                            shutil.copyfileobj(rf, f)
                    except Exception:
                        continue
            else:
                for inline_html in inline_parts:
                    f.write(inline_html); f.write("\n")
            for part in bottom_parts:
                f.write(part); f.write("\n")
            f.write("</div></body></html>\n")

        if _atomic_write:
            _atomic_write(out_path, writer)
        else:
            _default_write_atomic(out_path, writer)
    except Exception as e:
        logger.exception("Failed to write output file")
        warnings.append({"level": "error", "msg": f"write_failed: {e}"})
        return {"warnings": warnings, "tables": None, "rows": None}

    # optional gzip
    if getattr(cfg, "gzip_out", False):
        try:
            with open(out_path, "rb") as f_in, gzip.open(str(out_path) + ".gz", "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        except Exception as e:
            logger.exception("gzip failed")
            warnings.append({"level": "warn", "msg": f"gzip_failed: {e}"})

    runtime_ms = int((time.time() - start) * 1000)
    result = {"warnings": warnings, "tables": len(tables_list), "rows": total_rows, "runtime_ms": runtime_ms, "output": str(out_path)}
    if return_html:
        try:
            result["html"] = out_path.read_text(encoding="utf-8")
        except Exception:
            result["html"] = None

    # try cleanup
    try:
        if tmp_frag_dir.exists() and tmp_frag_dir != out_dir:
            shutil.rmtree(tmp_frag_dir)
    except Exception:
        pass

    return result
# core.chunk7.py -- Final utilities, cleanup helpers, render_table and public aliases
from typing import Union, Iterable

def _cleanup_fragments_safe(target_dirs: Iterable[Union[str, Path]]) -> List[str]:
    """
    Safely remove temporary fragment directories created by render_html.
    Returns list of removed paths (strings). Non-fatal on errors.
    """
    removed: List[str] = []
    try:
        for d in target_dirs:
            try:
                p = Path(d)
                if not p.exists() or not p.is_dir():
                    continue
                # remove any .frags_* directories inside
                for child in p.glob(".frags_*"):
                    try:
                        if child.is_dir():
                            shutil.rmtree(child, ignore_errors=True)
                            removed.append(str(child))
                    except Exception:
                        pass
                # also remove legacy .fragments dir if present
                frag = p / ".fragments"
                if frag.exists() and frag.is_dir():
                    try:
                        shutil.rmtree(frag, ignore_errors=True)
                        removed.append(str(frag))
                    except Exception:
                        pass
            except Exception:
                # ignore per-dir errors
                continue
    except Exception:
        # final fallback: nothing to do
        pass
    return removed

def _validate_assets_presence(out_dir: Union[str, Path], required: Iterable[str] = ("style.css", "script.js")) -> Dict[str, bool]:
    """
    Quick check that required asset files exist in out_dir/assets.
    Returns mapping filename -> exists (bool).
    """
    res: Dict[str, bool] = {}
    try:
        base = Path(out_dir) / "assets"
        for name in required:
            try:
                res[name] = _is_valid_file(base / name)
            except Exception:
                res[name] = False
    except Exception:
        for name in required:
            res[name] = False
    return res

def render_table(df, idx: int, markdown_to_html: Callable[[str], str], *, escape_cells: bool = True) -> str:
    """
    Render a single table as HTML string. Prefer convert_render_table when available.
    By default escape_cells=True to avoid injecting raw HTML from data.
    """
    total_units = 2 + 5
    left_width = 2 / total_units * 100
    right_width = 5 / total_units * 100
    try:
        if convert_render_table is not None:
            try:
                return convert_render_table(df, idx, markdown_to_html, left_width, right_width)
            except Exception:
                # fallback to pandas HTML with escaping controlled
                try:
                    return f"<h3 id='Table{idx}'>Table {idx}</h3>\n" + df.to_html(index=False, border=0, escape=escape_cells)
                except Exception:
                    return f"<h3 id='Table{idx}'>Table {idx}</h3>\n<p>(failed to render table)</p>"
        else:
            try:
                return f"<h3 id='Table{idx}'>Table {idx}</h3>\n" + df.to_html(index=False, border=0, escape=escape_cells)
            except Exception:
                return f"<h3 id='Table{idx}'>Table {idx}</h3>\n<p>(failed to render table)</p>"
    except Exception:
        return f"<h3 id='Table{idx}'>Table {idx}</h3>\n<p>(failed to render table)</p>"

# Public alias for API compatibility
render_page = render_html

# Expose small test helper that assembles a minimal page for a single table (useful for local checks)
def render_single_table_to_file(df, output_html: str, markdown_to_html: Callable[[str], str], *, cfg: Optional[RenderConfig] = None) -> Dict[str, Any]:
    """
    Convenience helper that wraps render_html for a single dataframe and returns the render result.
    Keeps behavior robust and conservative (escape by default).
    """
    try:
        return render_html([df], output_html, markdown_to_html, config=cfg or RenderConfig(), return_html=False, materialize=True)
    except Exception as e:
        logger.exception("render_single_table_to_file failed")
        return {"warnings": [{"level": "error", "msg": str(e)}], "tables": 0, "rows": 0, "runtime_ms": 0, "output": output_html}

# Final small module-level safety: when imported, do a lightweight self-check that core dependencies are present.
def _self_sanity_check():
    errs: List[str] = []
    try:
        # ensure critical helpers exist
        for fn in ("_default_write_atomic", "_ensure_dir_path", "_is_valid_file", "render_html"):
            if fn not in globals():
                errs.append(f"missing:{fn}")
    except Exception:
        pass
    if errs:
        logger.debug("core sanity checks flagged: %s", errs)

_self_sanity_check()

__all__ = [
    "render_html",
    "render_table",
    "render_page",
    "render_single_table_to_file",
    "_cleanup_fragments_safe",
    "_validate_assets_presence",
]
