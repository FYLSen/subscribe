addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const targetUrlParam = url.searchParams.get('url')
  if (!targetUrlParam) {
    return new Response('No URL parameter provided', { status: 400 })
  }
  const targetUrls = decodeURIComponent(targetUrlParam).split('|')

  const regexPatternParamBase64 = url.searchParams.get('RegExp')
  let regexPattern = regexPatternParamBase64 ? atob(regexPatternParamBase64) : '.*';

  let regex;
  try {
    regex = new RegExp(regexPattern);
  } catch (e) {
    return new Response('Invalid regular expression: ' + e.message, { status: 400 })
  }

  const fetchHeaders = new Headers({
    'User-Agent': request.headers.get('User-Agent'), 
    'Accept': request.headers.get('Accept'), 
  });
  const fetchOptions = {
    headers: fetchHeaders,
    method: 'GET',
  }

  const lineFilter = new LineFilter(regex)
  const errors = []
  const results = await fetchWithLimit(targetUrls, fetchOptions, lineFilter, errors)

  if (errors.length > 0) {
    return new Response(errors.join('\n'), { status: 502 })
  }

  return new Response(results.join('\n'), { status: 200 })
}

async function fetchWithLimit(urls, fetchOptions, lineFilter, errors, maxConcurrentRequests = 5) {
  let results = []
  for (let i = 0; i < urls.length; i += maxConcurrentRequests) {
    const batch = urls.slice(i, i + maxConcurrentRequests)
    const promises = batch.map(async url => {
      try {
        const response = await fetch(url, fetchOptions)
        if (!response.ok) {
          throw new Error(`HTTP status ${response.status}`)
        }
        const lines = await lineFilter.filterStream(response.body.getReader())
        results = results.concat(lines)
      } catch (e) {
        errors.push(`Error fetching ${url}: ${e.message}`)
      }
    })
    await Promise.all(promises)
  }
  return results;
}

class LineFilter {
  constructor(regex) {
    this.regex = regex
    this.decoder = new TextDecoder()
    this.proxyStart = false
  }

  async filterStream(reader) {
    let results = []
    let partialLine = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        if (partialLine && this.proxyStart) {
          results.push(partialLine.trim());
        }
        break
      }
      const chunk = this.decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      lines[0] = partialLine + lines[0];
      partialLine = chunk.endsWith('\n') ? '' : lines.pop();

      for (let line of lines) {
        line = line.trim();
        if (line === '[Proxy Group]') {
          break; 
        } else if (this.proxyStart && line && !line.startsWith('#') && this.regex.test(line)) {
          results.push(line);
        } else if (line === '[Proxy]') {
          this.proxyStart = true;
        }
      }
    }

    return results;
  }
}