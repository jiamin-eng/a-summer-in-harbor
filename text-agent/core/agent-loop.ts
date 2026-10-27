/**
 * Text agent loop: manages LLM interaction with tool calling
 * Provider-agnostic (supports OpenAI-compatible APIs)
 */

import type { Save } from '../../src/story/state';
import { renderState, formatPrompt } from './state-renderer';
import { getAvailableTools, type ToolDefinition } from './game-tools';
import { executeTool, type ToolExecutionResult } from './tool-executor';

export type AgentConfig = {
  provider: 'openai' | 'custom';
  apiKey: string;
  baseURL?: string;
  model?: string;
  locale?: 'zh' | 'en';
};

export type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

export type AgentResponse = {
  message: string;
  suggestedActions: string[];
  stateChanged: boolean;
  newSave?: Save;
};

const SYSTEM_PROMPT_ZH = `你是《海湾新生活》游戏的AI向导。玩家通过与你对话来玩这个2D RPG游戏。

游戏规则：
1. 玩家通过自然语言描述想做的事，你理解意图后调用相应的游戏工具
2. 所有游戏逻辑和验证都由游戏引擎处理，你只负责理解玩家意图和叙述结果
3. NEVER编造游戏内容 - 只描述工具返回的真实结果
4. 每回合提供2-4个具体的建议行动，帮助玩家推进游戏
5. 用轻松、友好的语气与玩家交流
6. 当玩家说模糊的话（如"四处看看"），先用observe_scene查看周围环境
7. 如果玩家的意图不清楚，询问或提供选项

叙述风格：
- 简洁，2-3段
- 重点是行动结果和新的可能性
- 如果是对话，引用NPC说的重要内容
- 每次回复结尾给出2-4个清晰的行动建议`;

const SYSTEM_PROMPT_EN = `You are the AI guide for "A Summer in Harbor", a 2D RPG. Players experience the game through conversation with you.

Game Rules:
1. Players describe what they want to do in natural language; you interpret and call game tools
2. All game logic and validation is handled by the game engine - you narrate results
3. NEVER make up content - only describe what tools return
4. Provide 2-4 specific suggested actions each turn to help players progress
5. Use a friendly, warm tone
6. When players say something vague (like "look around"), use observe_scene first
7. If player intent is unclear, ask or offer choices

Narrative Style:
- Concise, 2-3 paragraphs
- Focus on action outcomes and new possibilities
- Quote important NPC dialogue
- End each reply with 2-4 clear suggested actions`;

/**
 * Agent session: manages a single player's conversation
 */
export class AgentSession {
  private config: AgentConfig;
  private messages: Message[] = [];
  private currentSave: Save;
  private conversationHistory: Array<{ role: string; content: string }> = [];
  
  constructor(config: AgentConfig, initialSave: Save) {
    this.config = config;
    this.currentSave = initialSave;
    
    const locale = config.locale || initialSave.locale;
    const systemPrompt = locale === 'zh' ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;
    
    this.messages.push({
      role: 'system',
      content: systemPrompt
    });
  }
  
  /**
   * Process a player message and return agent response
   */
  async processMessage(playerMessage: string): Promise<AgentResponse> {
    const locale = this.config.locale || this.currentSave.locale;
    const isZh = locale === 'zh';
    
    // Add state context + player message
    const stateDesc = renderState(this.currentSave);
    const stateContext = formatPrompt(stateDesc);
    
    const userContent = `${stateContext}\n\n【玩家】${playerMessage}`;
    
    this.messages.push({
      role: 'user',
      content: userContent
    });
    
    let stateChanged = false;
    let iterations = 0;
    const maxIterations = 5; // Prevent infinite loops
    
    while (iterations < maxIterations) {
      iterations++;
      
      const tools = getAvailableTools(this.currentSave);
      const response = await this.callLLM(tools);
      
      if (!response.tool_calls || response.tool_calls.length === 0) {
        // No tool calls, return the response
        this.conversationHistory.push(
          { role: 'user', content: playerMessage },
          { role: 'assistant', content: response.content }
        );
        
        // Extract suggested actions from response
        const suggestedActions = this.extractSuggestedActions(response.content);
        
        return {
          message: response.content,
          suggestedActions,
          stateChanged,
          newSave: stateChanged ? this.currentSave : undefined
        };
      }
      
      // Execute tool calls
      this.messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls
      });
      
      for (const toolCall of response.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const { result, newSave } = await executeTool(
          this.currentSave,
          {
            tool: toolCall.function.name,
            arguments: args
          }
        );
        
        if (result.success && result.stateSnapshot) {
          this.currentSave = newSave;
          stateChanged = true;
        }
        
        const toolResult = result.success
          ? result.message
          : `Error: ${result.error}`;
        
        this.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: toolResult
        });
      }
      
      // Continue loop to let LLM narrate the results
    }
    
    // Max iterations reached
    return {
      message: isZh
        ? '抱歉，处理出现了问题。请重试。'
        : 'Sorry, something went wrong. Please try again.',
      suggestedActions: [],
      stateChanged,
      newSave: stateChanged ? this.currentSave : undefined
    };
  }
  
  private async callLLM(tools: ToolDefinition[]): Promise<any> {
    const apiKey = this.config.apiKey;
    const baseURL = this.config.baseURL || 'https://api.openai.com/v1';
    const model = this.config.model || 'gpt-4o-mini';
    
    const endpoint = `${baseURL}/chat/completions`;
    
    const requestBody = {
      model,
      messages: this.messages,
      tools: tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      })),
      tool_choice: 'auto'
    };
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.choices[0].message;
  }
  
  private extractSuggestedActions(message: string): string[] {
    // Simple extraction: look for numbered or bulleted lists near the end
    const lines = message.split('\n');
    const suggestions: string[] = [];
    
    let inSuggestions = false;
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect suggestion section
      if (/建议|可以|试试|下一步|suggested|try|next|you (could|can|might)/i.test(trimmed)) {
        inSuggestions = true;
      }
      
      // Extract numbered/bulleted items
      if (inSuggestions && /^[\d\-\*•]\s*(.+)/.test(trimmed)) {
        const match = trimmed.match(/^[\d\-\*•\.]+\s*(.+)/);
        if (match && match[1]) {
          suggestions.push(match[1].trim());
        }
      }
    }
    
    return suggestions.slice(0, 4);
  }
  
  getSave(): Save {
    return this.currentSave;
  }
}
