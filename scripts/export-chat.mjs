import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const outFile = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), 'docs/chat-history.md');

function readTranscriptPath() {
  if (process.argv[2]) return process.argv[2];
  const input = readFileSync(0, 'utf8');
  return JSON.parse(input).transcript_path;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function isHumanPrompt(entry) {
  if (entry.isMeta || entry.isSidechain) return false;
  const text = textOf(entry.message?.content).trim();
  return text.length > 0 && !text.startsWith('<');
}

const lines = readFileSync(readTranscriptPath(), 'utf8').split('\n').filter(Boolean);
const messages = [];

for (const line of lines) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }

  if (entry.type === 'user' && isHumanPrompt(entry)) {
    messages.push({ role: 'user', id: entry.uuid, text: textOf(entry.message.content).trim() });
  } else if (entry.type === 'assistant' && !entry.isSidechain) {
    const text = textOf(entry.message?.content).trim();
    if (!text) continue;
    const last = messages.at(-1);
    if (last?.role === 'assistant' && last.id === entry.message.id) {
      last.text += `\n\n${text}`;
    } else {
      messages.push({ role: 'assistant', id: entry.message.id, text });
    }
  }
}

const body = messages
  .map(({ role, text }) => `## ${role === 'user' ? 'User' : 'Claude'}\n\n${text}`)
  .join('\n\n---\n\n');

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `# Chat history\n\n${body}\n`);
