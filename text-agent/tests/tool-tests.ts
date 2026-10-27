/**
 * Tests for the tool layer
 * Verifies that tools correctly interact with game state
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initial, applyAction } from '../../src/story/state';
import { executeTool } from '../core/tool-executor';
import { getAvailableTools } from '../core/game-tools';

test('observe_scene returns current scene info', async () => {
  const save = initial('zh', 'test-1');
  
  const { result, newSave } = await executeTool(save, {
    tool: 'observe_scene',
    arguments: {}
  });
  
  assert.equal(result.success, true);
  assert.ok(result.message.includes('车站街'));
  assert.ok(result.stateSnapshot);
  assert.equal(newSave.version, save.version, 'State should not change');
});

test('introduce_to_person adds person to known list', async () => {
  const save = initial('zh', 'test-2');
  
  assert.equal(save.known.includes('mara'), false, 'Mara should start unknown');
  
  const { result, newSave } = await executeTool(save, {
    tool: 'introduce_to_person',
    arguments: { person: 'mara' }
  });
  
  assert.equal(result.success, true);
  assert.ok(result.message.length > 0);
  assert.equal(newSave.known.includes('mara'), true, 'Mara should now be known');
  assert.equal(newSave.version, save.version + 1, 'Version should increment');
});

test('talk_to_person lists topics when no topic provided', async () => {
  const save = initial('zh', 'test-3');
  
  // First introduce to Mara
  const { newSave: saveAfterIntro } = await executeTool(save, {
    tool: 'introduce_to_person',
    arguments: { person: 'mara' }
  });
  
  // Then talk without topic
  const { result, newSave } = await executeTool(saveAfterIntro, {
    tool: 'talk_to_person',
    arguments: { person: 'mara' }
  });
  
  assert.equal(result.success, true);
  assert.ok(result.metadata?.topics);
  assert.ok(result.metadata.topics.length > 0);
  assert.equal(newSave.version, saveAfterIntro.version, 'No state change when listing topics');
});

test('talk_to_person with topic applies conversation', async () => {
  const save = initial('zh', 'test-4');
  
  // First introduce
  const { newSave: saveAfterIntro } = await executeTool(save, {
    tool: 'introduce_to_person',
    arguments: { person: 'mara' }
  });
  
  // Talk with key topic
  const { result, newSave } = await executeTool(saveAfterIntro, {
    tool: 'talk_to_person',
    arguments: { person: 'mara', topic: 'key' }
  });
  
  assert.equal(result.success, true);
  assert.ok(result.message.includes('钥匙'));
  assert.equal(newSave.items.key, 1, 'Should receive key');
  assert.equal(newSave.flags.includes('key'), true, 'Key flag should be set');
});

test('travel_to moves player to new location', async () => {
  const save = initial('zh', 'test-5');
  
  assert.equal(save.scene, 'station');
  
  // First introduce to Mara and get the key
  const { newSave: s1 } = await executeTool(save, {
    tool: 'introduce_to_person',
    arguments: { person: 'mara' }
  });
  
  const { newSave: s2 } = await executeTool(s1, {
    tool: 'talk_to_person',
    arguments: { person: 'mara', topic: 'key' }
  });
  
  // Now travel to home
  const { result, newSave } = await executeTool(s2, {
    tool: 'travel_to',
    arguments: { destination: 'home' }
  });
  
  assert.equal(result.success, true);
  assert.equal(newSave.scene, 'home');
  assert.ok(newSave.visited.includes('home'));
});

test('interact_with_object executes object action', async () => {
  const save = initial('zh', 'test-6');
  
  // First get the key
  const { newSave: saveWithKey } = await executeTool(save, {
    tool: 'introduce_to_person',
    arguments: { person: 'mara' }
  });
  
  const { newSave: saveWithKey2 } = await executeTool(saveWithKey, {
    tool: 'talk_to_person',
    arguments: { person: 'mara', topic: 'key' }
  });
  
  // Go home
  const { newSave: saveAtHome } = await executeTool(saveWithKey2, {
    tool: 'travel_to',
    arguments: { destination: 'home' }
  });
  
  // Unpack
  const { result, newSave } = await executeTool(saveAtHome, {
    tool: 'interact_with_object',
    arguments: { object_id: 'bed', action: 'unpack' }
  });
  
  assert.equal(result.success, true);
  assert.equal(newSave.flags.includes('unpacked'), true);
});

test('available tools change based on state', async () => {
  const save = initial('zh', 'test-7');
  
  const toolsBefore = getAvailableTools(save);
  const introduceBefore = toolsBefore.find(t => t.name === 'introduce_to_person');
  assert.ok(introduceBefore, 'Should have introduce tool when people are unknown');
  
  // Introduce to Mara
  const { newSave } = await executeTool(save, {
    tool: 'introduce_to_person',
    arguments: { person: 'mara' }
  });
  
  const toolsAfter = getAvailableTools(newSave);
  const talkAfter = toolsAfter.find(t => t.name === 'talk_to_person');
  assert.ok(talkAfter, 'Should have talk tool after introduction');
  
  // Check that Mara is in the enum
  const personEnum = talkAfter.parameters.properties.person.enum;
  assert.ok(personEnum?.includes('mara'), 'Mara should be in talk person enum');
});

test('view_inventory shows items', async () => {
  const save = initial('zh', 'test-8');
  
  // Get key from Mara
  const { newSave: s1 } = await executeTool(save, {
    tool: 'introduce_to_person',
    arguments: { person: 'mara' }
  });
  
  const { newSave: s2 } = await executeTool(s1, {
    tool: 'talk_to_person',
    arguments: { person: 'mara', topic: 'key' }
  });
  
  const { result } = await executeTool(s2, {
    tool: 'view_inventory',
    arguments: {}
  });
  
  assert.equal(result.success, true);
  assert.ok(result.message.includes('租屋钥匙'));
  assert.ok(result.metadata?.inventory);
  assert.ok(result.metadata.inventory.key);
});

test('error handling for invalid actions', async () => {
  const save = initial('zh', 'test-9');
  
  // Try to interact with non-existent object
  const { result } = await executeTool(save, {
    tool: 'interact_with_object',
    arguments: { object_id: 'nonexistent', action: 'do-something' }
  });
  
  assert.equal(result.success, false);
  assert.ok(result.error);
});

console.log('All tool tests passed!');
