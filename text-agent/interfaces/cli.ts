/**
 * CLI interface for text agent
 * Interactive command-line chat for playing the game
 */

import { createInterface } from 'node:readline';
import { AgentSession, type AgentConfig } from '../core/agent-loop';
import { createSessionStore, getOrCreateSave } from '../core/session-manager';

const CLI_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '',
  baseURL: process.env.LLM_BASE_URL,
  model: process.env.LLM_MODEL || 'gpt-4o-mini',
  provider: 'openai' as const,
  locale: (process.env.GAME_LOCALE || 'zh') as 'zh' | 'en'
};

async function main() {
  const locale = CLI_CONFIG.locale;
  const isZh = locale === 'zh';
  
  if (!CLI_CONFIG.apiKey) {
    console.error(isZh
      ? '错误：未设置 LLM API 密钥。请设置环境变量 OPENAI_API_KEY 或 LLM_API_KEY'
      : 'Error: LLM API key not set. Please set OPENAI_API_KEY or LLM_API_KEY environment variable'
    );
    process.exit(1);
  }
  
  const dbPath = process.env.SESSION_DB_PATH || '.data/text-agent-sessions.sqlite';
  const store = await createSessionStore(dbPath);
  
  // For CLI, use a single player ID (or get from args)
  const playerId = process.argv[2] || 'cli-player';
  
  console.log(isZh
    ? `\n🌊 欢迎来到《海湾新生活》文字冒险版\n`
    : `\n🌊 Welcome to "A Summer in Harbor" - Text Adventure\n`
  );
  
  const save = await getOrCreateSave(store, playerId, locale);
  const session = new AgentSession(CLI_CONFIG, save);
  
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: isZh ? '\n你> ' : '\nYou> '
  });
  
  // Send initial greeting
  const greeting = isZh
    ? '你好！你来到了海湾小镇。告诉我你想做什么，我会帮你体验这个夏天的故事。'
    : 'Hello! You've arrived at the coastal town. Tell me what you'd like to do, and I'll guide you through this summer's story.';
  
  console.log(isZh ? `\n向导> ${greeting}\n` : `\nGuide> ${greeting}\n`);
  
  rl.prompt();
  
  rl.on('line', async (input) => {
    const message = input.trim();
    
    if (!message) {
      rl.prompt();
      return;
    }
    
    if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit' || message === '退出') {
      console.log(isZh ? '\n再见！' : '\nGoodbye!');
      await store.putSave(playerId, session.getSave());
      await store.close();
      rl.close();
      return;
    }
    
    try {
      console.log(isZh ? '\n[思考中...]' : '\n[Thinking...]');
      
      const response = await session.processMessage(message);
      
      console.log(isZh ? '\n向导> ' : '\nGuide> ');
      console.log(response.message);
      
      if (response.suggestedActions.length > 0) {
        console.log(isZh ? '\n💡 建议：' : '\n💡 Suggestions:');
        response.suggestedActions.forEach((action, i) => {
          console.log(`${i + 1}. ${action}`);
        });
      }
      
      // Save after each turn
      if (response.newSave) {
        await store.putSave(playerId, response.newSave);
      }
      
    } catch (err: any) {
      console.error(isZh ? '\n错误：' : '\nError: ', err.message);
    }
    
    rl.prompt();
  });
  
  rl.on('close', async () => {
    await store.putSave(playerId, session.getSave());
    await store.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
