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
    const errors = []

    for (const targetUrl of targetUrls) {
        try {
            const response = await fetch(targetUrl, fetchOptions)
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            const filtered = await filterStream(reader, decoder, regex)
            filteredLines.push(...filtered)
        } catch (error) {
            errors.push(`Error fetching ${targetUrl}: ${error.message}`)
        }
    }

    if (errors.length > 0) {
        return new Response(errors.join('\n'), { status: 500 })
    }

    return new Response(filteredLines.join('\n'), { status: 200 })
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
        } else {
            partialLine += lines[0]
        }
        
        handleLines(lines, filteredLines, regex)
    }

    if (partialLine !== '') {
        handleLines([partialLine], filteredLines, regex)
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

function handleLines(lines, filteredLines, regex) {
    const [proxyIndex, groupIndex] = findProxyGroupIndices(lines)
    
    if (proxyIndex !== -1 && groupIndex !== -1) {
        filteredLines.push(...filterLines(lines.slice(proxyIndex + 1, groupIndex), regex))
    } else if (proxyIndex === -1 && groupIndex !== -1) {
        filteredLines.push(...filterLines(lines.slice(0, groupIndex), regex))
    } else {
        filteredLines.push(...filterLines(lines, regex))
    }
}