addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const targetUrls = decodeURIComponent(url.searchParams.get('url')).split('|')
  const regexPattern = decodeURIComponent(url.searchParams.get('RegExp'))
  const regex = new RegExp(regexPattern)

  try {
    const filteredLines = []

    for (const targetUrl of targetUrls) {
      const response = await fetch(targetUrl)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const filtered = await filterStream(reader, decoder, regex)
      filteredLines.push(...filtered)
    }

    return new Response(filteredLines.join('\n'), { status: 200 })
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 })
  }
}

async function filterStream(reader, decoder, regex) {
  const filteredLines = []
  let partialLine = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n')

    if (lines.length > 1) {
      lines[0] = partialLine + lines[0]
      partialLine = lines.pop()
      const filtered = filterLines(lines, regex)
      filteredLines.push(...filtered)
    } else {
      partialLine += lines[0]
    }
  }

  if (partialLine !== '') {
    const filtered = filterLines([partialLine], regex)
    filteredLines.push(...filtered)
  }

  return filteredLines
}

function filterLines(lines, regex) {
  return lines.filter(line => {
    const trimmed = line.trim()
    return trimmed !== '' && !trimmed.startsWith('#') && regex.test(line)
  })
}
