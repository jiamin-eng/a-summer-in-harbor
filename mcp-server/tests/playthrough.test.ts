/**
 * Complete playthrough test - direct tool calls
 * Tests the full first quest without MCP protocol overhead
 */

import { initial } from '../../src/story/state.js';
import { sceneOffers, type OfferedAction } from '../../src/story/player-actions.js';
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
  
  const offered = (match: (action: OfferedAction) => boolean) => {
    const action = sceneOffers(state).actions.find(match);
    if (!action) return Promise.resolve({ success: false, error: '游戏没有列出这个动作', message: '' });
    return gameActions.act(state, action.action, action.target, locale);
  };
  const steps: Array<{ name: string; fn: () => Promise<gameActions.ToolResult> | gameActions.ToolResult; expect: string }> = [
    { name: '观察车站街', fn: () => gameActions.observeScene(state, locale), expect: '车站街' },
    { name: '与玛拉介绍', fn: () => offered((action) => action.action === 'introduce'), expect: '玛拉' },
    { name: '玛拉可以选的话', fn: () => gameActions.observeScene(state, locale), expect: '领取钥匙' },
    { name: '领取钥匙', fn: () => offered((action) => action.action === 'talk:key'), expect: '新的任务' },
    { name: '前往租屋', fn: () => offered((action) => action.action === 'travel' && action.destination === 'home'), expect: '租屋' },
    { name: '放下行李', fn: () => offered((action) => action.action === 'unpack'), expect: '行李' },
    { name: '返回车站街', fn: () => offered((action) => action.action === 'travel-map' && action.target === 'station'), expect: '抵达' },
    { name: '告知玛拉已安顿', fn: () => offered((action) => action.action === 'talk:settle'), expect: '咖啡馆' },
    { name: '前往咖啡馆', fn: () => offered((action) => action.action === 'travel' && action.destination === 'cafe'), expect: '咖啡馆' },
    { name: '与Theo介绍', fn: () => offered((action) => action.action === 'introduce'), expect: 'Theo' },
    { name: '取回工具袋', fn: () => offered((action) => action.action === 'talk:bag'), expect: '帆布袋' },
    { name: '快速返回车站街', fn: () => offered((action) => action.action === 'travel-map' && action.target === 'station'), expect: '抵达' },
    { name: '归还工具袋', fn: () => offered((action) => action.action === 'talk:return-bag'), expect: '谢谢' }
  ];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`步骤 ${i + 1}: ${step.name}`);
    
    try {
      const result = await step.fn();
      
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
