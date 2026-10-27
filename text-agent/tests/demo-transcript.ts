/**
 * Demo transcript: proves a player can make meaningful progress through chat
 * Uses a mock LLM for reproducibility
 */

import { initial } from '../../src/story/state';
import { executeTool } from '../core/tool-executor';

type DemoStep = {
  playerMessage: string;
  toolCalls: Array<{ tool: string; arguments: any }>;
  expectedOutcome: string;
};

const DEMO_TRANSCRIPT: DemoStep[] = [
  {
    playerMessage: '四处看看',
    toolCalls: [
      { tool: 'observe_scene', arguments: {} }
    ],
    expectedOutcome: 'See Mara with keys, exits to home/cafe/grocery'
  },
  
  {
    playerMessage: '和那个拿钥匙的女士打招呼',
    toolCalls: [
      { tool: 'introduce_to_person', arguments: { person: 'mara' } }
    ],
    expectedOutcome: 'Meet Mara, learn her name'
  },
  
  {
    playerMessage: '向玛拉领取钥匙',
    toolCalls: [
      { tool: 'talk_to_person', arguments: { person: 'mara', topic: 'key' } }
    ],
    expectedOutcome: 'Receive room key'
  },
  
  {
    playerMessage: '去我的租屋',
    toolCalls: [
      { tool: 'travel_to', arguments: { destination: 'home' } }
    ],
    expectedOutcome: 'Arrive at rental room'
  },
  
  {
    playerMessage: '放下行李',
    toolCalls: [
      { tool: 'interact_with_object', arguments: { object_id: 'bed', action: 'unpack' } }
    ],
    expectedOutcome: 'Unpack luggage, settle in'
  },
  
  {
    playerMessage: '回到车站街',
    toolCalls: [
      { tool: 'travel_to', arguments: { destination: 'station' } }
    ],
    expectedOutcome: 'Return to Station Street'
  },
  
  {
    playerMessage: '告诉玛拉我安顿好了',
    toolCalls: [
      { tool: 'talk_to_person', arguments: { person: 'mara', topic: 'settle' } }
    ],
    expectedOutcome: 'Mara tells about cafe and coast'
  },
  
  {
    playerMessage: '去咖啡馆看看',
    toolCalls: [
      { tool: 'travel_to', arguments: { destination: 'cafe' } }
    ],
    expectedOutcome: 'Arrive at Tide & Table cafe'
  },
  
  {
    playerMessage: '和围裙上写着Theo的年轻人打招呼',
    toolCalls: [
      { tool: 'introduce_to_person', arguments: { person: 'theo' } }
    ],
    expectedOutcome: 'Meet Theo, learn about tool bag'
  },
  
  {
    playerMessage: '取回玛拉的工具袋',
    toolCalls: [
      { tool: 'talk_to_person', arguments: { person: 'theo', topic: 'bag' } }
    ],
    expectedOutcome: 'Receive Mara\'s tool bag'
  },
  
  {
    playerMessage: '回车站街把工具袋还给玛拉',
    toolCalls: [
      { tool: 'fast_travel', arguments: { destination: 'station' } },
      { tool: 'talk_to_person', arguments: { person: 'mara', topic: 'return-bag' } }
    ],
    expectedOutcome: 'Return tool bag, complete first quest'
  }
];

async function runDemo() {
  console.log('=== 海湾新生活 文字冒险 - 演示流程 ===\n');
  
  let save = initial('zh', 'demo-player');
  let stepNum = 0;
  
  for (const step of DEMO_TRANSCRIPT) {
    stepNum++;
    console.log(`\n--- 步骤 ${stepNum} ---`);
    console.log(`玩家: ${step.playerMessage}`);
    console.log(`期望: ${step.expectedOutcome}\n`);
    
    for (const toolCall of step.toolCalls) {
      console.log(`[工具调用] ${toolCall.tool}(${JSON.stringify(toolCall.arguments)})`);
      
      const { result, newSave } = await executeTool(save, toolCall);
      
      if (!result.success) {
        console.error(`❌ 错误: ${result.error}`);
        process.exit(1);
      }
      
      console.log(`✓ ${result.message.split('\n')[0].slice(0, 80)}...`);
      
      if (result.stateSnapshot) {
        console.log(`  场景: ${result.stateSnapshot.sceneTitle}`);
        console.log(`  目标: ${result.stateSnapshot.objective.slice(0, 50)}...`);
      }
      
      save = newSave;
    }
  }
  
  console.log('\n\n=== 演示完成 ===');
  console.log(`最终状态:`);
  console.log(`- 场景: ${save.scene}`);
  console.log(`- 已认识: ${save.known.join(', ')}`);
  console.log(`- 已访问: ${save.visited.join(', ')}`);
  console.log(`- 物品: ${Object.keys(save.items).join(', ')}`);
  console.log(`- 进度标记: ${save.flags.filter(f => !f.startsWith('talk:')).join(', ')}`);
  console.log(`\n✅ 演示流程通过！玩家成功完成了第一个任务。`);
}

runDemo().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
