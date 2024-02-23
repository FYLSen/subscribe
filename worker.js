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
  let regexPattern;
  if (regexPatternParamBase64) {
    regexPattern = decodeURIComponent(atob(regexPatternParamBase64))
  } else {
    regexPattern = '.*'
  }
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
    headers: fetchHeaders
  }

  const lineFilter = new LineFilter(regex)
  const errors = []

  // Execute fetch requests with limited concurrency
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
        results.push(...lines)
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
    this.decoder = new TextDecoder() // Reuse a single decoder instance
  }

  async filterStream(reader) {
    let linesProcessed = []
    let partialLine = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        if (partialLine) {
          linesProcessed = linesProcessed.concat(this.handleLine(partialLine))
        }
        break
      }
      const chunk = this.decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')
      const isChunkEndWithNewLine = chunk.endsWith('\n')
      lines[0] = partialLine + lines[0]
      partialLine = isChunkEndWithNewLine ? '' : lines.pop()
      linesProcessed = linesProcessed.concat(this.handleLines(lines))
    }
    return linesProcessed
  }
  
  handleLines(lines) {
    let proxyStart = false
    let groupStart = false
    return lines.flatMap(line => {
      const trimmed = line.trim()
      if (trimmed === '[Proxy]') {
        proxyStart = true
        return []
      } else if (trimmed === '[Proxy Group]') {
        groupStart = true
        return []
      }
      const isCommentOrEmpty = trimmed === '' || trimmed.startsWith('#')
      const isInRightSection = proxyStart && !groupStart
      return !isCommentOrEmpty && isInRightSection && this.regex.test(trimmed) ? [trimmed] : []
    })
  }
}