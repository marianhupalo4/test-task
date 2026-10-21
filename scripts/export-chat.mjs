import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const outFile = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), 'docs/chat-history.md');

function readHookInput() {
  if (process.argv[2]) return { transcript_path: process.argv[2] };
  return JSON.parse(readFileSync(0, 'utf8'));
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function cleanPrompt(text) {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<\/?pasted_content[^>]*>/g, '')
    .trim();
}

function isHumanPrompt(entry) {
  if (entry.isMeta || entry.isSidechain) return false;
  const text = cleanPrompt(textOf(entry.message?.content));
  return text.length > 0 && !text.startsWith('<');
}

function readEntries(transcriptPath) {
  const entries = [];
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {}
  }
  return entries;
}

function activeBranch(entries) {
  const byId = new Map();
  for (const entry of entries) {
    if (entry.uuid && !entry.isSidechain) byId.set(entry.uuid, entry);
  }
  const leaf = entries.findLast(
    (entry) =>
      entry.uuid && !entry.isSidechain && (entry.type === 'user' || entry.type === 'assistant'),
  );
  const branch = [];
  const seen = new Set();
  let current = leaf;
  while (current && !seen.has(current.uuid)) {
    seen.add(current.uuid);
    branch.push(current);
    current = byId.get(current.parentUuid ?? current.logicalParentUuid);
  }
  return branch.reverse();
}

function collectMessages(entries) {
  const messages = [];
  for (const entry of activeBranch(entries)) {
    if (entry.type === 'user' && isHumanPrompt(entry)) {
      messages.push({
        role: 'user',
        id: entry.uuid,
        text: cleanPrompt(textOf(entry.message.content)),
      });
    } else if (entry.type === 'assistant') {
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
  return messages;
}

const input = readHookInput();
const messages = collectMessages(readEntries(input.transcript_path));

if (input.hook_event_name === 'UserPromptSubmit' && input.prompt) {
  const prompt = cleanPrompt(input.prompt);
  const last = messages.at(-1);
  if (prompt && !(last?.role === 'user' && last.text === prompt)) {
    messages.push({ role: 'user', text: prompt });
  }
}

const body = messages
  .map(({ role, text }) => `## ${role === 'user' ? 'User' : 'Claude'}\n\n${text}`)
  .join('\n\n---\n\n');

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `# Chat history\n\n${body}\n`);
