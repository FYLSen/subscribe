addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const targetUrlParam = url.searchParams.get('url');
  if (!targetUrlParam) {
    return new Response('No URL parameter provided', { status: 400 });
  }
  const targetUrls = decodeURIComponent(targetUrlParam).split('|').filter(isUrlSafe);

  const regex = createRegex(url.searchParams.get('RegExp'));
  if (regex instanceof Response) {
    return regex; 
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
  const { results, errors } = await fetchWithLimit(targetUrls, fetchOptions, lineFilter, 5);

  if (results.length === 0) {
    return new Response(errors.join('\n'), { status: 502 });
  }
  
  return new Response(results.join('\n'), { status: 200 });

} 

function createRegex(patternParam) {
  let regexPattern = patternParam ? decodeURIComponent(patternParam) : '.*';
  try {
    return new RegExp(regexPattern);
  } catch (e) {
    return new Response('Invalid regular expression: ' + e.message, { status: 400 });
  }
}

async function fetchWithLimit(urls, fetchOptions, lineFilter, maxConcurrentRequests) {
  let results = [];
  let errors = [];
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
        errors.push('Error fetching ' + url + ' : ' + error.message); 
      });
    });

    const settledPromises = await Promise.allSettled(batchPromises);
    settledPromises.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results = results.concat(result.value);
      } else if (result.status === 'rejected') {
        errors.push('Error in batch ' + (index + 1) + ': ' + result.reason);
      }
    });

    index += maxConcurrentRequests;
  }
  return { results, errors };
}

function isUrlSafe(url) {
  const urlPattern = /^https?:\/\/[^ "]+$/;
  return urlPattern.test(url);
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