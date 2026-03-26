import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

const USER_AGENT = 'VoiceAI-KnowledgeBot/1.0 (+https://yourapp.com/bot)';

export function isValidScrapableUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname;
    if (host === 'localhost') return false;
    if (/^127\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^10\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch { return false; }
}

async function checkRobotsTxt(url) {
  try {
    const parsed = new URL(url);
    const robotsUrl = `${parsed.origin}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return true; // No robots.txt = allowed
    const text = await res.text();
    const targetPath = parsed.pathname || '/';

    // Parse rules for user-agent * or VoiceAI-KnowledgeBot
    let currentAgentMatch = false;
    let disallowed = false;

    for (const rawLine of text.split('\n')) {
      const line = rawLine.split('#')[0].trim();
      if (!line) continue;

      const [field, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();

      if (field.toLowerCase() === 'user-agent') {
        currentAgentMatch = value === '*' || value.toLowerCase().includes('voiceai');
      } else if (field.toLowerCase() === 'disallow' && currentAgentMatch) {
        if (value && targetPath.startsWith(value)) {
          disallowed = true;
          break;
        }
      }
    }
    return !disallowed;
  } catch {
    return true; // On error, assume allowed
  }
}

export async function scrapeUrl(url) {
  let browser = null;
  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const result = await page.evaluate(() => {
      // Remove noise elements
      const selectors = [
        'nav', 'header', 'footer', 'script', 'style', 'iframe', 'noscript',
        '.cookie-banner', '.cookie-notice', '.cookie-popup',
        '[class*="nav"]', '[class*="menu"]', '[class*="footer"]',
        '[class*="sidebar"]', '[class*="cookie"]', '[class*="popup"]',
        '[class*="modal"]', '[class*="banner"]',
      ];
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      });

      const pageTitle = document.title || '';

      // Find all headings and extract sections
      const headings = document.querySelectorAll('h1, h2, h3');
      const sections = [];

      if (headings.length === 0) {
        // No headings: one big section
        const body = document.body?.innerText || '';
        sections.push({ title: pageTitle, body });
      } else {
        headings.forEach((heading) => {
          const title = heading.innerText?.trim() || '';
          let bodyParts = [];
          let sibling = heading.nextElementSibling;
          while (sibling && !['H1', 'H2', 'H3'].includes(sibling.tagName)) {
            bodyParts.push(sibling.innerText || '');
            sibling = sibling.nextElementSibling;
          }
          sections.push({ title, body: bodyParts.join(' ') });
        });
      }

      return { pageTitle, sections };
    });

    const cleanedSections = result.sections
      .map((section) => {
        const cleanBody = section.body
          .replace(/\s+/g, ' ')
          .split('\n')
          .filter((line) => line.trim().length >= 20)
          .join(' ')
          .trim()
          .slice(0, 2000);
        return { title: section.title || result.pageTitle, body: cleanBody };
      })
      .filter((s) => s.body.length > 0)
      .slice(0, 15);

    return { title: result.pageTitle, sections: cleanedSections, sourceUrl: url };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
      return { error: 'timeout' };
    }
    return { error: 'fetch_failed' };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}
