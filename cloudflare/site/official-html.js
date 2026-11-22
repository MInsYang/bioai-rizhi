// Bounded official newsroom adapter. The caller supplies the existing transport
// and record helpers so redirects, byte limits, backoff and classification have
// the same enforcement as RSS. No third-party link is fetched.
function invalid(message, permanent = true) {
  return Object.assign(new Error(message), {permanent});
}

function decode(value) {
  const named = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'};
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? all;
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
  });
}

export function cleanHTML(value) {
  return decode(String(value || '').replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<(script|style|nav|header|footer|aside|form|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<[^>]*>/g,' ')).replace(/[\s\u200b\u200d]+/g,' ').trim();
}

function attrs(text) {
  const result = {};
  for (const match of String(text).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  }
  return result;
}

function officialURL(value, base, config, article = false) {
  let url;
  try { url = new URL(value, base); } catch { throw invalid('Official HTML URL is malformed'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !config.allowed_hosts.includes(url.hostname)) {
    throw invalid('HTML link is outside the verified official host allowlist');
  }
  if (article && !config.article_path_prefixes.some(prefix => url.pathname.startsWith(prefix))) {
    throw invalid('HTML link is outside the verified article paths');
  }
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  url.hash = '';
  return url.href;
}

function contract(source) {
  const config = source.config || {};
  if (config.collection_mode !== undefined && !['fulltext','index_metadata'].includes(config.collection_mode)) {
    throw invalid('Unsupported official HTML collection mode');
  }
  if (config.official_html_verified !== true || !Array.isArray(config.allowed_hosts) || !config.allowed_hosts.length ||
      config.allowed_hosts.some(host => typeof host !== 'string' || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || host.includes('..')) ||
      !Array.isArray(config.article_path_prefixes) || !config.article_path_prefixes.length ||
      config.article_path_prefixes.some(path => typeof path !== 'string' || !path.startsWith('/') || path === '/' || path.includes('..'))) {
    throw invalid('Official HTML source lacks its verified host and article path contract');
  }
  if (config.article_selector && !/^(?:[a-z][a-z0-9-]*|[.#][a-zA-Z_][\w-]*)$/.test(config.article_selector)) {
    throw invalid('Unsupported official article selector');
  }
  if (!Number.isInteger(config.index_max_articles) || config.index_max_articles < 1 || config.index_max_articles > 8) {
    throw invalid('Official HTML source must declare one to eight articles per poll');
  }
  officialURL(source.url, source.url, config);
  if (config.collection_mode === 'index_metadata' &&
      (source.registry_key !== 'iambic-official-newsroom' || source.url !== 'https://www.iambic.ai/news' ||
       config.official_index_verified !== true || config.allowed_hosts.length !== 2 ||
       config.query_version !== 'official-index-2026-11-v1' ||
       !['www.iambic.ai','ir.iambic.ai'].every(host => config.allowed_hosts.includes(host)) ||
       config.article_path_prefixes.length !== 2 ||
       !['/post/','/news-releases/news-release-details/'].every(path => config.article_path_prefixes.includes(path)))) {
    throw invalid('Official index metadata mode lacks its approved Iambic index contract');
  }
  return config;
}

export function indexArticles(body, source) {
  const config = contract(source), found = [];
  // Discard scripts first: HTML or links embedded in a script are not anchors.
  const html = String(body).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const href = attrs(match[1]).href;
    if (!href) continue;
    let url;
    try { url = officialURL(href, source.url, config, true); } catch { continue; }
    if (!found.includes(url)) found.push(url);
    if (found.length >= config.index_max_articles) break;
  }
  if (!found.length) throw invalid('Official newsroom contains no matching article anchors; selector review required');
  return found;
}

const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function strictAttrs(text) {
  const result = Object.create(null);
  let offset = 0;
  while (offset < text.length) {
    const space = text.slice(offset).match(/^\s+/);
    if (space) { offset += space[0].length; continue; }
    const name = text.slice(offset).match(/^[a-zA-Z_:][\w:.-]*/)?.[0]?.toLowerCase();
    if (!name || Object.hasOwn(result,name) || Object.keys(result).length >= 64) throw invalid('Official index attributes are malformed or duplicated');
    offset += name.length;
    offset += text.slice(offset).match(/^\s*/)[0].length;
    let value = '';
    if (text[offset] === '=') {
      offset++;
      offset += text.slice(offset).match(/^\s*/)[0].length;
      const quote = text[offset];
      if (quote === '"' || quote === "'") {
        const end = text.indexOf(quote,offset+1);
        if (end < 0) throw invalid('Official index attribute is truncated');
        value = text.slice(offset+1,end); offset = end+1;
      } else {
        value = text.slice(offset).match(/^[^\s"'`=<>]+/)?.[0];
        if (!value) throw invalid('Official index attribute value is absent');
        offset += value.length;
      }
      if (offset < text.length && !/\s/.test(text[offset])) throw invalid('Official index attributes lack a separator');
    }
    result[name] = decode(value);
  }
  return result;
}

function indexDOM(body) {
  // This opt-in parser accepts a balanced, bounded HTML tree. It never repairs
  // a changed card structure or searches unrelated/hidden tabs for substitutes.
  const html = String(body);
  if (!html || html.length > 1_500_000) throw invalid('Official index exceeds its bounded HTML contract');
  const root = {tag:'#document',attributes:{},children:[]}, stack = [root];
  let offset = 0, nodes = 0;
  while (offset < html.length) {
    if (++nodes > 12000) throw invalid('Official index has too many DOM nodes');
    if (html[offset] !== '<') {
      const end = html.indexOf('<',offset), next = end < 0 ? html.length : end;
      stack.at(-1).children.push(html.slice(offset,next)); offset = next; continue;
    }
    if (html.startsWith('<!--',offset)) {
      const end = html.indexOf('-->',offset+4);
      if (end < 0) throw invalid('Official index comment is truncated');
      offset = end+3; continue;
    }
    if (/^<!doctype\s+html\s*>/i.test(html.slice(offset,offset+32))) {
      offset = html.indexOf('>',offset)+1; continue;
    }
    let end = offset+1, quote = '';
    for (; end < html.length && end-offset <= 32768; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= html.length || end-offset > 32768) throw invalid('Official index tag is truncated or too large');
    const token = html.slice(offset,end+1), closing = token.match(/^<\/([a-z][\w:-]*)\s*>$/i);
    offset = end+1;
    if (closing) {
      if (stack.length === 1 || stack.at(-1).tag !== closing[1].toLowerCase()) throw invalid('Official index DOM is unbalanced');
      stack.pop(); continue;
    }
    const opening = token.match(/^<([a-z][\w:-]*)([\s\S]*?)\/?\s*>$/i);
    if (!opening) throw invalid('Official index contains unsupported markup');
    const tag = opening[1].toLowerCase(), attributes = strictAttrs(opening[2]);
    if (tag === 'script' || tag === 'style') {
      const close = new RegExp('</'+tag+'\\s*>','ig'); close.lastIndex = offset;
      const found = close.exec(html);
      if (!found) throw invalid('Official index raw-text element is truncated');
      offset = close.lastIndex; continue;
    }
    const node = {tag,attributes,children:[]}; stack.at(-1).children.push(node);
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(token)) {
      if (stack.length >= 64) throw invalid('Official index DOM is too deep');
      stack.push(node);
    }
  }
  if (stack.length !== 1) throw invalid('Official index DOM is truncated');
  return root;
}

function descendants(node, accepts) {
  const found = [];
  for (const child of node.children) if (typeof child !== 'string') {
    if (accepts(child)) found.push(child);
    found.push(...descendants(child,accepts));
  }
  return found;
}

function indexText(node) {
  const text = child => typeof child === 'string' ? child : child.children.map(text).join(' ');
  return decode(text(node)).replace(/\s+/g,' ').trim();
}

function one(nodes, description) {
  if (nodes.length !== 1) throw invalid('Official index requires one '+description);
  return nodes[0];
}

function field(card, attribute) {
  const value = indexText(one(descendants(card,node => Object.hasOwn(node.attributes,attribute)),attribute));
  if (!value || value.length > 1000 || /[\u0000-\u001f\u007f]/.test(value)) throw invalid('Official index field is absent or invalid: '+attribute);
  return value;
}

function indexDate(raw) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const found = raw.match(/^([A-Za-z]+) ([1-9]|[12]\d|3[01]), (20\d{2})$/), month = found ? months.indexOf(found[1]) : -1;
  if (!found || month < 0) throw invalid('Official index publication date is not a verified calendar date');
  const published = new Date(Date.UTC(Number(found[3]),month,Number(found[2])));
  if (published.getUTCMonth() !== month || published.getUTCDate() !== Number(found[2])) throw invalid('Official index publication date is impossible');
  return published.toISOString();
}

export function extractOfficialIndex(body, source) {
  const config = contract(source);
  if (config.collection_mode !== 'index_metadata') throw invalid('Official index metadata mode is not approved');
  const root = indexDOM(body), featured = one(descendants(root,node => Object.hasOwn(node.attributes,'data-news-featured')),'featured news card');
  const archive = one(descendants(root,node => Object.hasOwn(node.attributes,'data-news-archive')),'news archive');
  const list = one(archive.children.filter(node => typeof node !== 'string' && node.attributes.role === 'list'),'direct archive list');
  const archived = list.children.filter(node => typeof node !== 'string');
  if (!archived.length || archived.length > 31 || archived.some(node => node.attributes.role !== 'listitem')) throw invalid('Official index archive cards are absent or out of bounds');
  const cards = [featured,...archived], articles = [], seen = new Set();
  let excluded_pdf_count = 0;
  for (const card of cards) {
    const category = field(card,'data-news-primary'), title = field(card,'data-news-title'), publication_date_raw = field(card,'data-news-date');
    const published_at = indexDate(publication_date_raw), anchor = one(descendants(card,node => node.tag === 'a'),'card link');
    if (!(anchor.attributes.class || '').split(/\s+/).includes('link-w-arrow') || !anchor.attributes.href) throw invalid('Official index card link is missing or changed');
    if (category !== 'Press') {
      let pdf;
      try { pdf = new URL(anchor.attributes.href,source.url); } catch { throw invalid('Official index excluded PDF URL is malformed'); }
      if (!['Publications','Presentations'].includes(category) || pdf.protocol !== 'https:' || pdf.username || pdf.password ||
          (pdf.port && pdf.port !== '443') || pdf.hostname !== 'cdn.prod.website-files.com' || pdf.search || pdf.hash ||
          !/^\/(?:64c03f218d60985b40eeeae5|64d1614b6114857407c79035)\/[^/]+\.pdf$/i.test(pdf.pathname)) {
        throw invalid('Official index has an unreviewed non-Press card target');
      }
      excluded_pdf_count++; continue;
    }
    const canonical_url = officialURL(anchor.attributes.href,source.url,config,true), url = new URL(canonical_url);
    const path = url.hostname === 'www.iambic.ai' ? /^\/post\/[a-z0-9-]+\/?$/ : /^\/news-releases\/news-release-details\/[a-z0-9-]+\/?$/;
    if (url.search || !path.test(url.pathname)) throw invalid('Official index has an unreviewed Press article URL');
    if (seen.has(canonical_url)) throw invalid('Official index contains duplicate Press article URLs');
    seen.add(canonical_url);
    articles.push({canonical_url,external_id:canonical_url,title,content_text:'',published_at,publication_date_raw});
    if (articles.length > config.index_max_articles) throw invalid('Official index exceeds its approved Press article bound');
  }
  if (!articles.length) throw invalid('Official index has no verified Press cards');
  return {articles,excluded_pdf_count,card_count:cards.length};
}

function selectedHTML(body, selector, minimumLength = 0, accepts = () => true) {
  // Match one tag, id or class and balance nested tags of the same type. Newsroom
  // structure changes fail explicitly rather than collecting an unrelated page.
  const html = String(body).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase(), attributes = attrs(match[2]);
    const matches = selector[0] === '#' ? attributes.id === selector.slice(1) : selector[0] === '.' ?
      (attributes.class || '').split(/\s+/).includes(selector.slice(1)) : tag === selector;
    if (!matches) continue;
    const start = match.index + match[0].length, tokens = new RegExp('<(/?)'+tag+'\\b[^>]*>','gi');
    tokens.lastIndex = start;
    let level = 1, token, closed = false;
    while ((token = tokens.exec(html))) {
      if (token[1]) level--; else if (!token[0].endsWith('/>')) level++;
      if (level === 0) {
        const found = html.slice(start, token.index);
        closed = true;
        if (cleanHTML(found).length >= minimumLength && accepts(found)) return found;
        break;
      }
    }
    if (!closed) throw invalid('Official article container is truncated', false);
  }
  return null;
}

function articleJSON(body) {
  const nodes = [];
  for (const match of String(body).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if ((attrs(match[1]).type || '').toLowerCase() !== 'application/ld+json') continue;
    try { nodes.push(JSON.parse(match[2])); } catch { /* optional structured metadata; HTML remains required */ }
  }
  let scanned = 0;
  while (nodes.length && scanned++ < 200) {
    const node = nodes.shift();
    if (Array.isArray(node)) { nodes.push(...node); continue; }
    if (!node || typeof node !== 'object') continue;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some(type => ['Article','NewsArticle','BlogPosting','ScholarlyArticle'].includes(type))) return node;
    if (node['@graph']) nodes.push(node['@graph']);
  }
  return {};
}

function date(value) {
  const raw = String(value || '').trim();
  if (!raw || !/\d{4}/.test(raw)) return null;
  const exactDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (exactDate) {
    const calendar = new Date(Date.UTC(Number(exactDate[1]),Number(exactDate[2])-1,Number(exactDate[3]))).toISOString().slice(0,10);
    if (calendar !== exactDate[0].slice(0,10)) return null;
  }
  // A visible calendar date has no publisher-supplied timezone. Encode that date
  // at UTC midnight consistently; never let the worker/machine timezone shift it.
  const humanDate = /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/i.test(raw);
  const timestamp = Date.parse(humanDate ? raw+' UTC' : raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function extractOfficialArticle(body, source, requestedURL) {
  const config = contract(source), json = articleJSON(body), metadata = {};
  for (const match of String(body).matchAll(/<meta\b([^>]*)>/gi)) {
    const value = attrs(match[1]);
    metadata[(value.property || value.name || '').toLowerCase()] = value.content;
  }
  const selected = selectedHTML(body, config.article_selector || 'article',60) ?? (!config.article_selector ? selectedHTML(body,'main',60) : null);
  if (selected === null && !json.articleBody) throw invalid('Verified official article container is absent; selector review required');
  const content = cleanHTML(json.articleBody || selected);
  const h1 = String(selected || body).match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1] || String(body).match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1];
  const title = cleanHTML(json.headline || h1 || metadata['og:title']);
  if (!title || content.length < 60) throw invalid('Official article is missing its title or substantive body');
  // A modified timestamp is preserved separately and is never a publication date.
  let dateRaw = json.datePublished || metadata['article:published_time'] || metadata['datepublished'] || null;
  if (!dateRaw) {
    const time = String(selected || '').match(/<time\b([^>]*)>([\s\S]*?)<\/time\s*>/i);
    if (time) dateRaw = attrs(time[1]).datetime || cleanHTML(time[2]);
  }
  if (!dateRaw && config.publication_date_selector) {
    if (!/^(?:[a-z][a-z0-9-]*|[.#][a-zA-Z_][\w-]*)$/.test(config.publication_date_selector)) throw invalid('Unsupported publication date selector');
    dateRaw = cleanHTML(selectedHTML(body, config.publication_date_selector,0,found => !!date(cleanHTML(found))));
  }
  return {canonical_url:officialURL(requestedURL, source.url, config, true), external_id:officialURL(requestedURL,source.url,config,true),
    title, content_text:content.slice(0,200000), published_at:date(dateRaw),
    provenance:{format:'official_html',publication_date_raw:dateRaw || null,publication_date_precision:dateRaw && !/T\d{2}:\d{2}/.test(String(dateRaw)) ? 'date' : dateRaw ? 'timestamp' : null,
      date_modified_raw:json.dateModified || metadata['article:modified_time'] || null,
      article_selector:config.article_selector || 'article-or-main',source_company_id:source.company_id || null,
      structured_article_types:json['@type'] || null}};
}

function metrics(state, response, retrieved = 0, matched = 0) {
  return {...state,retrieved_total:Number(state.retrieved_total || 0)+retrieved,matched_total:Number(state.matched_total || 0)+matched,
    bytes_total:Number(state.bytes_total || 0)+response.bytes};
}

export async function officialHTML(source, state, env, {request, record}) {
  const config = contract(source);
  if (config.collection_mode === 'index_metadata') {
    // Only the fixed, approved index is fetched; article and PDF URLs are data.
    const response = await request(source.url,['www.iambic.ai'],env,{}, {allow_redirects:false});
    if (response.status !== 200 || response.url !== source.url) throw invalid('Official index response is not the approved HTTP 200 index');
    const {articles,excluded_pdf_count,card_count} = extractOfficialIndex(response.body,source);
    const index_fetched_at = new Date(env.NOW?.() ?? Date.now()).toISOString();
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(response.body));
    const index_content_hash = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
    const records = [];
    for (const article of articles) {
      const {publication_date_raw,...fields} = article;
      const item = await record(source,fields,{format:'official_index',content_level:'index_metadata',fulltext_status:'not_fetched',
        collection_mode:'index_metadata',classification_scope:'title_only',index_url:response.url,index_fetched_at,index_content_hash,
        publication_date_raw,publication_date_precision:'date',source_company_id:source.company_id || null},state,response);
      if (item) records.push(item);
    }
    return {done:true,state:metrics({...state,phase:'official_index_complete',collection_mode:'index_metadata',excluded_pdf_count,card_count},response,articles.length,records.length),records,response};
  }
  if (!state.article_urls) {
    // Index validators are not reused for article requests. Re-fetching the
    // index on every poll also discovers edits to existing official articles.
    const response = await request(source.url,config.allowed_hosts,env);
    const article_urls = indexArticles(response.body,source);
    return {done:false,state:metrics({...state,phase:'official_html_article',article_urls,offset:0,index_url:response.url},response),records:[],response};
  }
  if (!Array.isArray(state.article_urls) || !state.article_urls.length || state.article_urls.length > config.index_max_articles ||
      !Number.isInteger(state.offset) || state.offset < 0 || state.offset >= state.article_urls.length) {
    throw invalid('Official HTML checkpoint is invalid');
  }
  const url = officialURL(state.article_urls[state.offset],source.url,config,true);
  const response = await request(url,config.allowed_hosts,env);
  const article = extractOfficialArticle(response.body,source,response.url), {provenance,...fields} = article;
  const item = await record(source,fields,{...provenance,index_url:state.index_url || source.url},state,response);
  const offset = state.offset + 1;
  return {done:offset === state.article_urls.length,state:metrics({...state,offset},response,1,item ? 1 : 0),records:item ? [item] : [],response};
}
