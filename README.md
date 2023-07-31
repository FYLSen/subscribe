# Cloudflare Workers RegExp Filter

Cloudflare Workers RegExp Filter is a simple Cloudflare Workers script that filters lines of text from one or more URLs using a regular expression.

## Features

- Fetches text files from one or more URLs
- Filters lines of text using a regular expression
- Supports both single-line and multi-line regular expressions
- Returns the filtered lines of text as plain text

## Usage

To use Cloudflare Workers RegExp Filter, you need to deploy it as a Cloudflare Worker and provide it with two query parameters:

- `url`: a pipe-separated list of URLs to fetch (e.g. `url=https%3A%2F%2Fexample.com%2Ffile.txt|https%3A%2F%2Fexample.net%2Ffile.txt`)
- `RegExp`: a regular expression to filter the lines of text (e.g. `RegExp=%5E%5BA-Z%5D%2B%3A%20.*$`)

Here is an example URL that fetches two text files and filters the lines of text that start with a capital letter followed by a colon and a space:

```
https://your-worker.your-account.workers.dev?url=https%3A%2F%2Fexample.com%2Ffile.txt|https%3A%2F%2Fexample.net%2Ffile.txt&RegExp=%5E%5BA-Z%5D%2B%3A%20.*$
```

To deploy Cloudflare Workers RegExp Filter, follow these steps:

1. Install [Wrangler](https://developers.cloudflare.com/workers/cli-wrangler) on your local machine.
2. Clone this repository to your local machine.
3. Copy the `wrangler.toml.example` file to `wrangler.toml`, and update it with your Cloudflare account ID and other configuration options.
4. Run `wrangler publish` to deploy the script to your Cloudflare Workers account.

## Limitations

- Cloudflare Workers RegExp Filter can only fetch text files from HTTP or HTTPS URLs.
- Cloudflare Workers RegExp Filter has no access to external tools or services, such as email or calendar.
- Cloudflare Workers RegExp Filter may have performance issues when filtering very large text files.

## License

Cloudflare Workers RegExp Filter is licensed under the [MIT License](LICENSE).