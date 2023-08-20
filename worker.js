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

    const filteredLines = []

    for (const targetUrl of targetUrls) {
        try {
            const response = await fetch(targetUrl, fetchOptions)
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            const filtered = await filterStream(reader, decoder, regex)
            filteredLines.push(...filtered)
        } catch (error) {
            return new Response(`Error: ${error.message}`, { status: 500 })
        }
    }

    return new Response(filteredLines.join('\n'), { status: 200 })
}

async function filterStream(reader, decoder, regex) {
    const filteredLines = []
    let partialLine = ''
    let isManagedConfig = false
    let managedConfigLines = []

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
            handleLines(lines, managedConfigLines, filteredLines, regex)
        } else {
            partialLine += lines[0]
        }
    }

    if (partialLine !== '') {
        handleLines([partialLine], managedConfigLines, filteredLines, regex)
    }

    if (managedConfigLines.length > 0) {
        const filtered = filterLines(managedConfigLines, regex)
        filteredLines.push(...filtered)
    }

    return filteredLines
}

function filterLines(lines, regex) {
    return lines.reduce((accum, line) => {
        const trimmed = line.trim()
        if (trimmed !== '' && !trimmed.startsWith('#') && regex.test(line)) {
            accum.push(line)
        }
        return accum
    }, [])
}

function findProxyGroupIndices(lines) {
    let proxyIndex = -1
    let groupIndex = -1

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line === '[Proxy]') {
            proxyIndex = i
        } else if (line === '[Proxy Group]') {
            groupIndex = i
            break
        }
    }

    return [proxyIndex, groupIndex]
}

function handleLines(lines, managedConfigLines, filteredLines, regex) {
    const [proxyIndex, groupIndex] = findProxyGroupIndices(lines)
    if (proxyIndex !== -1 && groupIndex !== -1) {
        managedConfigLines.push(...lines.slice(proxyIndex, groupIndex + 1))
        const filtered = filterLines(managedConfigLines, regex)
        filteredLines.push(...filtered)
        managedConfigLines = []
    } else if (proxyIndex === -1 && groupIndex !== -1) {
        const filtered = filterLines(lines.slice(0, groupIndex), regex)
        filteredLines.push(...filtered)
    } else {
        const filtered = filterLines(lines, regex)
        filteredLines.push(...filtered)
    }
}