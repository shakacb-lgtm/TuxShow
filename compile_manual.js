import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Headless Electron mode setup
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, // Headless
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Read version from package.json
  let version = '1.5.2';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    version = pkg.version;
  } catch (e) {
    console.warn('[PDF Compiler] Failed to read version from package.json, defaulting to 1.5.2');
  }

  const mdPath = path.join(__dirname, 'docs', `TuxShow_v${version}_Manual.md`);
  if (!fs.existsSync(mdPath)) {
     console.error(`[PDF Compiler] Manual markdown file not found: ${mdPath}`);
     app.quit();
     return;
  }

  console.log(`[PDF Compiler] Parsing manual: ${mdPath}`);
  const mdContent = fs.readFileSync(mdPath, 'utf8');
  const htmlContent = generateHtml(mdContent, version);

  const tempHtmlPath = path.join(__dirname, 'temp_manual.html');
  fs.writeFileSync(tempHtmlPath, htmlContent);

  await win.loadFile(tempHtmlPath);

  // Print to A4 PDF
  const pdfPath = path.join(__dirname, 'docs', `TuxShow v${version}.pdf`);
  const options = {
    printBackground: true,
    pageSize: 'A4',
    margins: {
      top: 0.4,
      bottom: 0.4,
      left: 0.4,
      right: 0.4
    }
  };

  try {
    const data = await win.webContents.printToPDF(options);
    fs.writeFileSync(pdfPath, data);
    console.log(`[PDF Compiler] PDF Manual successfully generated at ${pdfPath}`);
  } catch (err) {
    console.error('[PDF Compiler] Failed to generate PDF manual:', err);
  } finally {
    try {
      fs.unlinkSync(tempHtmlPath);
    } catch (e) {}
    app.quit();
  }
});

function generateHtml(md, version) {
  let content = md;

  // Escape HTML tags to prevent injections (except we want HTML-like rendering)
  content = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headings
  content = content.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  content = content.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  content = content.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  content = content.replace(/^#### (.*$)/gim, '<h4>$1</h4>');

  // Bold and italic
  content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Code blocks
  content = content.replace(/```([\s\S]*?)```/g, (match, code) => {
    const unescaped = code
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    return `<pre><code>${unescaped}</code></pre>`;
  });

  // Inline code
  content = content.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Blockquotes starting with >
  const lines = content.split('\n');
  let insideBlockquote = false;
  let blockquoteText = '';
  let finalLines = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('&gt;')) {
      if (!insideBlockquote) {
        insideBlockquote = true;
      }
      let cleanedLine = line.replace(/^\s*&gt;\s?/, '');
      // Restore basic formatting inside blockquote if it got escaped
      cleanedLine = cleanedLine
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      blockquoteText += (blockquoteText ? '<br>' : '') + cleanedLine;
    } else {
      if (insideBlockquote) {
        finalLines.push(`<blockquote>${blockquoteText}</blockquote>`);
        blockquoteText = '';
        insideBlockquote = false;
      }
      finalLines.push(line);
    }
  }
  if (insideBlockquote) {
    finalLines.push(`<blockquote>${blockquoteText}</blockquote>`);
  }
  content = finalLines.join('\n');

  // Unordered list items: lines starting with - or *
  content = content.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
  
  // Wrap list items in <ul>
  const lines2 = content.split('\n');
  let insideList = false;
  let finalLines2 = [];
  for (let line of lines2) {
    const trimmed = line.trim();
    if (trimmed.startsWith('<li>') || trimmed.endsWith('</li>')) {
      if (!insideList) {
        finalLines2.push('<ul>');
        insideList = true;
      }
      finalLines2.push(line);
    } else {
      if (insideList) {
        finalLines2.push('</ul>');
        insideList = false;
      }
      finalLines2.push(line);
    }
  }
  if (insideList) {
    finalLines2.push('</ul>');
  }
  content = finalLines2.join('\n');

  // Paragraphs
  const lines3 = content.split('\n');
  let finalLines3 = [];
  let inPre = false;
  for (let line of lines3) {
    const trimmed = line.trim();
    if (trimmed.startsWith('<pre>')) inPre = true;
    if (trimmed.endsWith('</pre>')) inPre = false;

    if (!inPre && trimmed !== '' && 
        !trimmed.startsWith('<h') && 
        !trimmed.startsWith('<ul') && 
        !trimmed.startsWith('<li') && 
        !trimmed.startsWith('</ul') && 
        !trimmed.startsWith('</li') && 
        !trimmed.startsWith('<blockquote') && 
        !trimmed.startsWith('</blockquote')) {
      finalLines3.push(`<p>${line}</p>`);
    } else {
      finalLines3.push(line);
    }
  }
  content = finalLines3.join('\n');

  // Return full styled manual template page
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TuxShow v${version} User Manual</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;700;800&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Inter', sans-serif;
      color: #334155;
      line-height: 1.6;
      font-size: 14px;
      margin: 0;
      padding: 40px;
      background: #ffffff;
    }
    
    h1, h2, h3, h4 {
      font-family: 'Outfit', sans-serif;
      color: #0f172a;
      font-weight: 700;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }

    h1 {
      font-size: 28px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-top: 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    h2 {
      font-size: 20px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      color: #1e3a8a;
      margin-top: 32px;
    }

    h3 {
      font-size: 16px;
      color: #2563eb;
    }

    p {
      margin-top: 0;
      margin-bottom: 16px;
      text-align: justify;
    }

    ul {
      margin-top: 0;
      margin-bottom: 16px;
      padding-left: 24px;
    }

    li {
      margin-bottom: 6px;
    }

    code {
      font-family: 'Fira Code', monospace;
      font-size: 12px;
      background: #f1f5f9;
      color: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin-top: 0;
      margin-bottom: 16px;
      border: 1px solid #1e293b;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      border: none;
      font-size: 12px;
    }

    blockquote {
      border-left: 4px solid #3b82f6;
      background: #f0f7ff;
      color: #1e293b;
      padding: 14px 18px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }

    blockquote p {
      margin-bottom: 8px;
    }

    blockquote p:last-child {
      margin-bottom: 0;
    }

    strong {
      color: #0f172a;
      font-weight: 600;
    }

    /* Print styling rules */
    @media print {
      body {
        padding: 0;
      }
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>
  `;
}
