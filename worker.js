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

  const regexPatternParam = url.searchParams.get('RegExp')
  if (!regexPatternParam) {
    return new Response('No RegExp parameter provided', { status: 400 })
  }
  
  const regexPattern = decodeURIComponent(regexPatternParam)
  let regex;
  try {
    regex = new RegExp(regexPattern);
  } catch (e) {
    return new Response('Invalid regular expression: ' + e.message, { status: 400 })
  }

  const fetchOptions = {
    headers: request.headers
  }

  const lineFilter = new LineFilter(regex)
  const errors = []

  const results = await Promise.allSettled(targetUrls.map(targetUrl => 
    fetch(targetUrl, fetchOptions).then(response => {
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`)
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      return lineFilter.filterStream(reader, decoder)
    })
  ));

  results.forEach((result, idx) => {
    if (result.status === 'rejected') {
      errors.push(`Error fetching ${targetUrls[idx]}: ${result.reason}`)
    }
  });

  if (errors.length > 0) {
    return new Response(errors.join('\n'), { status: 502 })
  }

  return new Response(lineFilter.getFilteredLines().join('\n'), { status: 200 })
}

class LineFilter {
  constructor(regex) {
    this.regex = regex
    this.filteredLines = []
    this.partialLine = ''
  }

  getFilteredLines() {
    return this.filteredLines
  }

  async filterStream(reader, decoder) {
    let lastChunkEndedWithNewLine = false;
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        if (!lastChunkEndedWithNewLine && this.partialLine !== '') {
          this.handleLines([this.partialLine])
        }
        break
      }

      const chunk = decoder.decode(value, { stream: true })
      lastChunkEndedWithNewLine = chunk.endsWith('\n');
      const lines = chunk.split('\n')

      lines[0] = this.partialLine + lines[0]
      this.partialLine = lines.pop()

      this.handleLines(lines)
    }

    if (this.partialLine) {
      this.handleLines([this.partialLine])
      this.partialLine = ''
    }
  }

  filterLines(lines) {
    return lines.filter(line => {
      const trimmed = line.trim()
      return trimmed !== '' && !trimmed.startsWith('#') && this.regex.test(line)
    })
  }

  findProxyGroupIndices(lines) {
    let proxyIndex = -1
    let groupIndex = -1

    for(let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if(line === '[Proxy]') {
        proxyIndex = i
      } else if(line === '[Proxy Group]') {
        groupIndex = i
        break
      }
    }

    return [proxyIndex, groupIndex]
  }

  handleLines(lines) {
    const [proxyIndex, groupIndex] = this.findProxyGroupIndices(lines)

    if(proxyIndex !== -1 && groupIndex !== -1) {
      this.filteredLines.push(...this.filterLines(lines.slice(proxyIndex + 1, groupIndex)))
    } else if(proxyIndex === -1 && groupIndex !== -1) {
      this.filteredLines.push(...this.filterLines(lines.slice(0, groupIndex)))
    } else {
      this.filteredLines.push(...this.filterLines(lines))
    }
  }
}