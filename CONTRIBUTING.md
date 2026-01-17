# Contributing to Civic Dashboard

Thank you for your interest in contributing to the Civic Dashboard project! This guide will help you get started.

## How to Contribute

### Reporting Issues

Found a bug or have a feature suggestion? Please [open an issue](https://github.com/yourusername/civic-dashboard/issues) with:

- A clear, descriptive title
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Screenshots if applicable
- Your environment (OS, Node version, browser)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run the tests: `npm run lint && npm run build`
5. Commit with a clear message describing your changes
6. Push to your fork and submit a pull request

## Development Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/yourusername/civic-dashboard.git
   cd civic-dashboard
   npm install
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Add your API keys to `.env` (see README for details)

4. Start the development server:
   ```bash
   npm run dev
   ```

## Code Style

- **TypeScript**: All new code should be written in TypeScript
- **Formatting**: The project uses ESLint for code style
- **Comments**: Add comments for complex logic, but prefer self-documenting code
- **Imports**: Use absolute imports with `@/` prefix (e.g., `@/lib/db`)

Run the linter before submitting:
```bash
npm run lint
```

## Testing

Before submitting a PR, verify:

1. The build succeeds: `npm run build`
2. The linter passes: `npm run lint`
3. The app works locally with your changes

## Project Structure

Key areas for contribution:

- `src/lib/scraper/` - Data extraction from external sources
- `src/lib/summarize.ts` - AI summarization logic
- `src/components/` - React UI components
- `src/app/` - Next.js pages and API routes

## Adapting for Other Cities

If you're adapting this for your city:

1. Update `city-config.json` with your city's information
2. Check that your city uses compatible data sources (CivicClerk, Municode)
3. Test the scrapers work with your city's portal structure
4. Submit any necessary changes as a PR to help others

## Questions?

Feel free to open an issue for questions about contributing. We're happy to help!

## Code of Conduct

Be respectful and constructive in all interactions. This is a civic project meant to help communities - let's keep it positive.
