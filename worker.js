addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const targetUrls = decodeURIComponent(url.searchParams.get('url')).split('|')
  const regexPattern = decodeURIComponent(url.searchParams.get('RegExp'))
  const regex = new RegExp(regexPattern)

  const fetchOptions = {
    headers: request.headers
  }

  const lineFilter = new LineFilter(regex)
  const errors = []

  for(const targetUrl of targetUrls) {
    try {
      const response = await fetch(targetUrl, fetchOptions)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      await lineFilter.filterStream(reader, decoder)
    } catch (error) {
      errors.push(`Error fetching ${targetUrl}: ${error.message}`)
    }
  }

  if(errors.length > 0) {
    return new Response(errors.join('\n'), { status: 500 })
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
    while(true) {
      const {
        done,
        value
      } = await reader.read()

      if(done) {
        break
      }

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      if(lines.length > 1) {
        lines[0] = this.partialLine + lines[0]
        this.partialLine = lines.pop()
      } else {
        this.partialLine += lines[0]
      }

      this.handleLines(lines)
    }

    if(this.partialLine !== '') {
      this.handleLines([this.partialLine])
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