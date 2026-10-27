/**
 * Complete playthrough test - direct tool calls
 * Tests the full first quest without MCP protocol overhead
 */

import { initial } from '../../src/story/state.js';
import { InMemoryStateStore } from '../state/store.js';
import * as gameActions from '../tools/game-actions.js';

async function runPlaythrough() {
  console.log('=== 完整任务流程测试 ===\n');
  
  const sessionId = 'playthrough-' + Date.now();
  const locale = 'zh';
  const stateStore = new InMemoryStateStore();
  
  // Initialize state
  let state = initial(locale, sessionId);
  await stateStore.save(sessionId, state);
  
  const steps = [
    { name: '观察车站街', fn: () => gameActions.observeScene(state, locale), expect: '车站街' },
    { name: '与玛拉介绍', fn: () => gameActions.introduce(state, 'mara', locale), expect: '玛拉' },
    { name: '领取钥匙', fn: () => gameActions.talk(state, 'mara', 'key', locale), expect: '钥匙' },
    { name: '前往租屋', fn: () => gameActions.travel(state, 'home', locale), expect: '租屋' },
    { name: '放下行李', fn: () => gameActions.useObject(state, 'bed', 'unpack', locale), expect: '行李' },
    { name: '返回车站街', fn: () => gameActions.fastTravel(state, 'station', locale), expect: '抵达' },
    { name: '告知玛拉已安顿', fn: () => gameActions.talk(state, 'mara', 'settle', locale), expect: '咖啡馆' },
    { name: '前往咖啡馆', fn: () => gameActions.travel(state, 'cafe', locale), expect: '咖啡馆' },
    { name: '与Theo介绍', fn: () => gameActions.introduce(state, 'theo', locale), expect: 'Theo' },
    { name: '取回工具袋', fn: () => gameActions.talk(state, 'theo', 'bag', locale), expect: '帆布袋' },
    { name: '快速返回车站街', fn: () => gameActions.fastTravel(state, 'station', locale), expect: '抵达' },
    { name: '归还工具袋', fn: () => gameActions.talk(state, 'mara', 'return-bag', locale), expect: '谢谢' }
  ];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`步骤 ${i + 1}: ${step.name}`);
    
    try {
      const result = step.fn();
      
      if (!result.success) {
        console.error(`  ❌ 失败: ${result.error}`);
        process.exit(1);
      }
      
      if (!result.message.includes(step.expect)) {
        console.error(`  ❌ 结果不符合预期`);
        console.error(`  期望包含: ${step.expect}`);
        console.error(`  实际结果: ${result.message.slice(0, 100)}...`);
        process.exit(1);
      }
      
      console.log(`  ✓ ${result.message.split('\n')[0].slice(0, 60)}...`);
      
      // Save state after each successful action
      await stateStore.save(sessionId, state);
    } catch (err: any) {
      console.error(`  ❌ 错误: ${err.message}`);
      process.exit(1);
    }
  }
  
  // Verify final state
  state = await stateStore.load(sessionId) || state;
  console.log('\n=== 最终状态 ===');
  console.log(`场景: ${state.scene}`);
  console.log(`已认识: ${state.known.join(', ')}`);
  console.log(`已访问: ${state.visited.join(', ')}`);
  console.log(`物品: ${Object.keys(state.items).join(', ')}`);
  console.log(`进度: ${state.flags.filter(f => !f.startsWith('talk:')).slice(0, 10).join(', ')}`);
  
  // Verify quest completion
  if (state.flags.includes('bag-returned')) {
    console.log('\n✅ 任务完成！玩家成功归还了工具袋。');
  } else {
    console.error('\n❌ 任务未完成');
    process.exit(1);
  }
}

runPlaythrough().catch(err => {
  console.error('流程测试失败:', err);
  process.exit(1);
});
