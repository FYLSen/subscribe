addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const targetUrlParam = url.searchParams.get('url');
  if (!targetUrlParam) {
    return new Response('No URL parameter provided', { status: 400 });
  }
  const targetUrls = decodeURIComponent(targetUrlParam).split('|');

  const regexPatternParam = url.searchParams.get('RegExp');
  let regexPattern = regexPatternParam ? decodeURIComponent(regexPatternParam) : '.*';

  let regex;
  try {
    regex = new RegExp(regexPattern);
  } catch (e) {
    return new Response('Invalid regular expression: ' + e.message, { status: 400 });
  }

  const fetchHeaders = new Headers({
    'User-Agent': request.headers.get('User-Agent'), 
    'Accept': request.headers.get('Accept'), 
  });
  const fetchOptions = {
    headers: fetchHeaders,
    method: 'GET',
  };

  const lineFilter = new LineFilter(regex);
  const errors = [];
  const results = await fetchWithLimit(targetUrls, fetchOptions, lineFilter, errors);

  if (results.length === 0) {
    return new Response(errors.join('\n'), { status: 502 });
  }

  return new Response(results.join('\n'), { status: 200 });
}

async function fetchWithLimit(urls, fetchOptions, lineFilter, errors, maxConcurrentRequests = 5) {
  let results = [];
  let index = 0;
  while (index < urls.length) {
    const batchUrls = urls.slice(index, index + maxConcurrentRequests);
    const batchPromises = batchUrls.map(url => {
      return fetch(url, fetchOptions).then(response => {
        if (!response.ok) {
          throw new Error(`HTTP status ${response.status}`);
        }
        return lineFilter.filterStream(response.body.getReader());
      }).then(lines => {
        results = results.concat(lines);
      }).catch(error => {
        errors.push(`Error fetching ${url}: ${error.message}`);
      });
    });
    await Promise.all(batchPromises);
    index += maxConcurrentRequests;
  }
  return results;
}

class LineFilter {
  constructor(regex) {
    this.regex = regex;
    this.decoder = new TextDecoder();
    this.proxySection = false;
  }

  async filterStream(reader) {
    let results = [];
    let partialLine = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (partialLine && this.proxySection) {
          results.push(partialLine.trim());
        }
        break;
      }
      const chunk = this.decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      lines[0] = partialLine + lines[0];
      partialLine = lines.pop();
      if (!chunk.endsWith('\n')) {
        partialLine += '\n';
      }
      
      for (let line of lines) {
        line = line.trim();
        if (line === '[Proxy Group]') {
          this.proxySection = false;
        } else if (line === '[Proxy]') {
          this.proxySection = true;
        } else if (this.proxySection && line && !line.startsWith('#') && this.regex.test(line)) {
          results.push(line);
        }
      }
    }

    return results;
  }
}